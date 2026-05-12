import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_CATALOG } from "@/lib/badges/catalog";
import type { BadgeDefinition } from "@/lib/badges/catalog";
import { extractClaimYear } from "@/lib/badges/helpers";
import type {
  BadgeEvaluatorInput,
  ClaimAggregate,
  MonthlySnapshotLite,
  StreakLite,
} from "@/lib/types/domain";
import type { BadgeEarnedRow, ConsultantRow } from "@/lib/supabase/database.types";
import type { BadgeTier, Role } from "@/lib/types";

export type RecomputeMode = "commit" | "rollback";

export interface BadgeRecomputeSummary {
  inserted: number;
  removed: number;
  newlyEarned: Array<{
    consultant_id: string;
    badge_key: string;
    role: Role;
    tier: BadgeTier;
    progress_data: Record<string, unknown>;
  }>;
}

/**
 * Recompute badge tier earns for the given consultants.
 *
 * Always inserts new tier rows that the consultant now qualifies for.
 *
 * When `mode === "rollback"`, also removes existing badges_earned rows whose
 * tier is no longer earnable. The brief calls badges "permanent" — they are,
 * but a true rollback of underlying data is supposed to undo badges that
 * were *first earned by the now-rolled-back upload*. This is the safe
 * approximation: any tier the consultant no longer qualifies for after the
 * rollback is removed.
 */
export async function recomputeBadges(
  supabase: SupabaseClient,
  consultantIds: string[],
  mode: RecomputeMode,
  asOfDate: Date = new Date(),
): Promise<BadgeRecomputeSummary> {
  const ids = [...new Set(consultantIds)].filter(Boolean);
  if (ids.length === 0) return { inserted: 0, removed: 0, newlyEarned: [] };

  // 1. Load consultants, claim history (both roles), streaks, snapshots,
  //    reviewer counts, partner-pairing counts.
  const { data: consultantsRaw, error: cErr } = await supabase
    .from("consultants")
    .select("*")
    .in("id", ids);
  if (cErr) throw new Error(`failed to load consultants: ${cErr.message}`);
  const consultants = (consultantsRaw ?? []) as ConsultantRow[];

  const { data: allConsultantsLite, error: lcErr } = await supabase
    .from("consultants")
    .select("id, display_name, has_technical_data, has_financial_data");
  if (lcErr) throw new Error(`failed to load consultants_lite: ${lcErr.message}`);

  // Claim aggregates where each affected consultant is involved (either
  // role, or as a reviewer for Trusted Pair / The Gatekeeper / Triple Threat).
  const { data: techClaimsRaw, error: tErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("lead_consultant_id", ids);
  if (tErr) throw new Error(`failed to load tech claims: ${tErr.message}`);
  const { data: finClaimsRaw, error: fErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("lead_expert_id", ids);
  if (fErr) throw new Error(`failed to load fin claims: ${fErr.message}`);
  const { data: trClaimsRaw, error: trErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("tech_writeup_reviewer_id", ids);
  if (trErr) throw new Error(`failed to load tech reviewer claims: ${trErr.message}`);
  const { data: crClaimsRaw, error: crErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("cost_assessment_reviewer_id", ids);
  if (crErr) throw new Error(`failed to load cost reviewer claims: ${crErr.message}`);

  const decorate = (rows: ClaimAggregate[]): ClaimAggregate[] =>
    rows.map((r) => ({
      ...r,
      net_amount: Number(r.net_amount),
      claim_year: extractClaimYear(r.claim_reference),
    }));
  const techClaims = decorate((techClaimsRaw ?? []) as ClaimAggregate[]);
  const finClaims = decorate((finClaimsRaw ?? []) as ClaimAggregate[]);
  const trClaims = decorate((trClaimsRaw ?? []) as ClaimAggregate[]);
  const crClaims = decorate((crClaimsRaw ?? []) as ClaimAggregate[]);

  const { data: streaksRaw, error: sErr } = await supabase
    .from("streaks")
    .select("*")
    .in("consultant_id", ids);
  if (sErr) throw new Error(`failed to load streaks: ${sErr.message}`);

  // Per-role leaderboard snapshots for Built Different. Fetch ALL months
  // because the badge measures every month the consultant ever won.
  const { data: leaderboardRaw, error: lbErr } = await supabase
    .from("monthly_snapshots")
    .select(
      "consultant_id, role, year_month, ops_count, net_fees, avg_cycle_days, rank, total_consultants",
    );
  if (lbErr) throw new Error(`failed to load leaderboard snapshots: ${lbErr.message}`);

  const { data: existingBadges, error: bErr } = await supabase
    .from("badges_earned")
    .select("*")
    .in("consultant_id", ids);
  if (bErr) throw new Error(`failed to load badges_earned: ${bErr.message}`);

  // Build lookup maps.
  const claimsByConsultantRole = new Map<string, ClaimAggregate[]>();
  const addClaims = (id: string | null, role: Role, claims: ClaimAggregate[]) => {
    if (!id) return;
    const key = `${id}|${role}`;
    const arr = claimsByConsultantRole.get(key) ?? [];
    for (const c of claims) {
      // Avoid duplicates when a claim is associated via multiple paths.
      if (!arr.find((x) => x.claim_reference === c.claim_reference)) arr.push(c);
    }
    claimsByConsultantRole.set(key, arr);
  };
  for (const id of ids) {
    addClaims(
      id,
      "technical",
      techClaims.filter((c) => c.lead_consultant_id === id),
    );
    addClaims(
      id,
      "financial",
      finClaims.filter((c) => c.lead_expert_id === id),
    );
  }

  // Reviewer counts.
  const reviewerStats = new Map<string, { tech: number; cost: number }>();
  for (const id of ids) reviewerStats.set(id, { tech: 0, cost: 0 });
  for (const c of trClaims) {
    if (!c.is_valid_op) continue;
    if (c.tech_writeup_reviewer_id && reviewerStats.has(c.tech_writeup_reviewer_id)) {
      reviewerStats.get(c.tech_writeup_reviewer_id)!.tech += 1;
    }
  }
  for (const c of crClaims) {
    if (!c.is_valid_op) continue;
    if (c.cost_assessment_reviewer_id && reviewerStats.has(c.cost_assessment_reviewer_id)) {
      reviewerStats.get(c.cost_assessment_reviewer_id)!.cost += 1;
    }
  }

  // Snapshot lookup per consultant.
  const consultantSnaps = new Map<string, MonthlySnapshotLite[]>();
  for (const id of ids) consultantSnaps.set(id, []);
  for (const s of leaderboardRaw ?? []) {
    if (consultantSnaps.has(s.consultant_id)) {
      consultantSnaps.get(s.consultant_id)!.push({
        consultant_id: s.consultant_id,
        role: s.role as Role,
        year_month: s.year_month,
        ops_count: s.ops_count,
        net_fees: Number(s.net_fees),
        avg_cycle_days: s.avg_cycle_days === null ? null : Number(s.avg_cycle_days),
        rank: s.rank,
        total_consultants: s.total_consultants,
      });
    }
  }
  const leaderboardSnaps: MonthlySnapshotLite[] = (leaderboardRaw ?? []).map((s) => ({
    consultant_id: s.consultant_id,
    role: s.role as Role,
    year_month: s.year_month,
    ops_count: s.ops_count,
    net_fees: Number(s.net_fees),
    avg_cycle_days: s.avg_cycle_days === null ? null : Number(s.avg_cycle_days),
    rank: s.rank,
    total_consultants: s.total_consultants,
  }));

  // Streaks per consultant per role.
  const streaksByConsultant = new Map<string, StreakLite[]>();
  for (const id of ids) streaksByConsultant.set(id, []);
  for (const s of streaksRaw ?? []) {
    if (streaksByConsultant.has(s.consultant_id)) {
      streaksByConsultant.get(s.consultant_id)!.push({
        consultant_id: s.consultant_id,
        role: s.role as Role,
        streak_type: s.streak_type,
        current_count: s.current_count,
        best_count: s.best_count,
        started_at: s.started_at,
        last_extended_at: s.last_extended_at,
        is_active: s.is_active,
      });
    }
  }

  // Partner-op counts for Dream Team — pairing the affected consultants
  // with the *other* side of every claim they're on.
  const partnerByConsultant = new Map<string, Map<string, number>>();
  for (const id of ids) partnerByConsultant.set(id, new Map());
  for (const c of techClaims) {
    if (!c.is_valid_op || !c.lead_consultant_id || !c.lead_expert_id) continue;
    if (partnerByConsultant.has(c.lead_consultant_id)) {
      const m = partnerByConsultant.get(c.lead_consultant_id)!;
      m.set(c.lead_expert_id, (m.get(c.lead_expert_id) ?? 0) + 1);
    }
  }
  for (const c of finClaims) {
    if (!c.is_valid_op || !c.lead_consultant_id || !c.lead_expert_id) continue;
    if (partnerByConsultant.has(c.lead_expert_id)) {
      const m = partnerByConsultant.get(c.lead_expert_id)!;
      m.set(c.lead_consultant_id, (m.get(c.lead_consultant_id) ?? 0) + 1);
    }
  }

  // Existing-badges lookup.
  const existingByKey = new Map<string, BadgeEarnedRow>();
  for (const b of (existingBadges ?? []) as BadgeEarnedRow[]) {
    existingByKey.set(`${b.consultant_id}|${b.badge_key}|${b.role}|${b.tier}`, b);
  }

  // 2. Walk the catalog per consultant per role.
  type Insert = {
    consultant_id: string;
    badge_key: string;
    role: Role;
    tier: BadgeTier;
    earned_at: string;
    progress_data: Record<string, unknown>;
  };
  const toInsert: Insert[] = [];
  const toRemove: string[] = []; // ids of badges_earned rows to delete

  for (const consultant of consultants) {
    for (const role of ["technical", "financial"] as Role[]) {
      const ownerClaims = claimsByConsultantRole.get(`${consultant.id}|${role}`) ?? [];
      if (
        ownerClaims.length === 0 &&
        reviewerStats.get(consultant.id)?.[role === "technical" ? "tech" : "cost"] === 0
      ) {
        // Nothing to evaluate for this role.
        continue;
      }

      const rstats = reviewerStats.get(consultant.id) ?? { tech: 0, cost: 0 };
      const partnerOpCounts = partnerByConsultant.get(consultant.id) ?? new Map();

      const input: BadgeEvaluatorInput = {
        consultantId: consultant.id,
        role,
        asOfDate,
        claimAggregates: ownerClaims,
        allConsultants: (allConsultantsLite ?? []).map((c) => ({
          id: c.id,
          display_name: c.display_name,
          has_technical_data: c.has_technical_data,
          has_financial_data: c.has_financial_data,
        })),
        monthlySnapshots: (consultantSnaps.get(consultant.id) ?? []).filter((s) => s.role === role),
        leaderboardSnapshots: leaderboardSnaps,
        streaks: (streaksByConsultant.get(consultant.id) ?? []).filter((s) => s.role === role),
        reviewerStats: { techWriteupCount: rstats.tech, costAssessmentCount: rstats.cost },
        partnerOpCounts,
      };

      for (const badge of BADGE_CATALOG) {
        if (!badgeAppliesToRole(badge, role)) continue;
        const evaluation = badge.evaluate(input);
        for (const tier of evaluation.earnedTiers) {
          const key = `${consultant.id}|${badge.key}|${role}|${tier}`;
          if (existingByKey.has(key)) continue;
          toInsert.push({
            consultant_id: consultant.id,
            badge_key: badge.key,
            role,
            tier,
            earned_at: asOfDate.toISOString(),
            progress_data: {
              ...evaluation.progressData,
              currentValue: evaluation.currentValue,
              progressLabel: evaluation.progressLabel,
            },
          });
        }
        if (mode === "rollback") {
          // Remove any persisted tier that is no longer earnable.
          const earnedSet = new Set(evaluation.earnedTiers);
          for (const tier of (badge.tiers ?? []).map((t) => t.tier)) {
            const key = `${consultant.id}|${badge.key}|${role}|${tier}`;
            const existing = existingByKey.get(key);
            if (existing && !earnedSet.has(tier)) toRemove.push(existing.id);
          }
        }
      }
    }
  }

  // 3. Apply DB writes.
  let inserted = 0;
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error } = await supabase
        .from("badges_earned")
        .upsert(chunk, { onConflict: "consultant_id,badge_key,role,tier", ignoreDuplicates: true });
      if (error) throw new Error(`failed to insert badges_earned: ${error.message}`);
      inserted += chunk.length;
    }
  }

  let removed = 0;
  if (toRemove.length > 0) {
    for (let i = 0; i < toRemove.length; i += 200) {
      const chunk = toRemove.slice(i, i + 200);
      const { error } = await supabase.from("badges_earned").delete().in("id", chunk);
      if (error) throw new Error(`failed to delete badges_earned: ${error.message}`);
      removed += chunk.length;
    }
  }

  return {
    inserted,
    removed,
    newlyEarned: toInsert.map((i) => ({
      consultant_id: i.consultant_id,
      badge_key: i.badge_key,
      role: i.role,
      tier: i.tier,
      progress_data: i.progress_data,
    })),
  };
}

function badgeAppliesToRole(badge: BadgeDefinition, role: Role): boolean {
  return badge.role === "both" || badge.role === role;
}
