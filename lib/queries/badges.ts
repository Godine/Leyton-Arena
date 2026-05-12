import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_CATALOG } from "@/lib/badges/catalog";
import type { BadgeCategory, BadgeDefinition } from "@/lib/badges/catalog";
import { extractClaimYear } from "@/lib/badges/helpers";
import type { BadgeEarnedRow, ClaimAggregateRow } from "@/lib/supabase/database.types";
import type { BadgeTier, Role } from "@/lib/types";

export interface BadgeView {
  badge: BadgeDefinition;
  earnedTiers: Array<{ tier: BadgeTier; earned_at: string }>;
  highestEarned: BadgeTier | null;
  nextTier: BadgeTier | null;
  currentValue: number;
  progressLabel: string;
  progressToNext: number; // 0..1
}

const TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "platinum", "diamond", "mythic"];

export async function loadBadgesForConsultant(
  supabase: SupabaseClient,
  consultantId: string,
  role: Role,
): Promise<BadgeView[]> {
  // We need:
  //   - All earned badges for this consultant in this role.
  //   - The consultant's full claim history in this role, so evaluator
  //     functions can compute progress.
  //   - The leaderboard snapshots for Built Different.
  //   - The streaks for streak-driven badges.
  //   - Reviewer counts for Trusted Pair / The Gatekeeper.
  //   - Partner counts for Dream Team.
  //
  // Most of this mirrors the orchestrator's badge runner; reuse the catalog
  // evaluator path so progress maths stays in sync.
  const ownerColumn = role === "technical" ? "lead_consultant_id" : "lead_expert_id";

  const [
    { data: earnedRows },
    { data: claimsRaw },
    { data: snaps },
    { data: streaks },
    { data: trClaims },
    { data: crClaims },
    { data: partnerClaimsTech },
    { data: partnerClaimsFin },
  ] = await Promise.all([
    supabase
      .from("badges_earned")
      .select("badge_key, tier, earned_at")
      .eq("consultant_id", consultantId)
      .eq("role", role),
    supabase.from("claim_aggregates").select("*").eq(ownerColumn, consultantId),
    supabase
      .from("monthly_snapshots")
      .select(
        "consultant_id, role, year_month, ops_count, net_fees, avg_cycle_days, rank, total_consultants",
      ),
    supabase
      .from("streaks")
      .select(
        "consultant_id, role, streak_type, current_count, best_count, started_at, last_extended_at, is_active",
      )
      .eq("consultant_id", consultantId)
      .eq("role", role),
    supabase
      .from("claim_aggregates")
      .select("claim_reference, is_valid_op")
      .eq("tech_writeup_reviewer_id", consultantId),
    supabase
      .from("claim_aggregates")
      .select("claim_reference, is_valid_op")
      .eq("cost_assessment_reviewer_id", consultantId),
    supabase
      .from("claim_aggregates")
      .select("lead_consultant_id, lead_expert_id, is_valid_op")
      .eq("lead_consultant_id", consultantId),
    supabase
      .from("claim_aggregates")
      .select("lead_consultant_id, lead_expert_id, is_valid_op")
      .eq("lead_expert_id", consultantId),
  ]);

  const earnedByBadge = new Map<string, Array<{ tier: BadgeTier; earned_at: string }>>();
  for (const e of (earnedRows ?? []) as Pick<
    BadgeEarnedRow,
    "badge_key" | "tier" | "earned_at"
  >[]) {
    const arr = earnedByBadge.get(e.badge_key) ?? [];
    arr.push({ tier: e.tier, earned_at: e.earned_at });
    earnedByBadge.set(e.badge_key, arr);
  }

  const claims = ((claimsRaw ?? []) as ClaimAggregateRow[]).map((c) => ({
    ...c,
    net_amount: Number(c.net_amount),
    claim_year: extractClaimYear(c.claim_reference),
  }));

  const partnerOpCounts = new Map<string, number>();
  for (const c of partnerClaimsTech ?? []) {
    if (!c.is_valid_op || !c.lead_expert_id) continue;
    partnerOpCounts.set(c.lead_expert_id, (partnerOpCounts.get(c.lead_expert_id) ?? 0) + 1);
  }
  for (const c of partnerClaimsFin ?? []) {
    if (!c.is_valid_op || !c.lead_consultant_id) continue;
    partnerOpCounts.set(c.lead_consultant_id, (partnerOpCounts.get(c.lead_consultant_id) ?? 0) + 1);
  }

  const reviewerStats = {
    techWriteupCount: (trClaims ?? []).filter((c) => c.is_valid_op).length,
    costAssessmentCount: (crClaims ?? []).filter((c) => c.is_valid_op).length,
  };

  const views: BadgeView[] = [];
  for (const badge of BADGE_CATALOG) {
    if (badge.role !== "both" && badge.role !== role) continue;
    const ev = badge.evaluate({
      consultantId,
      role,
      asOfDate: new Date(),
      claimAggregates: claims,
      allConsultants: [],
      monthlySnapshots: (
        (snaps ?? []) as Array<{
          consultant_id: string;
          role: Role;
          year_month: string;
          ops_count: number;
          net_fees: number;
          avg_cycle_days: number | null;
          rank: number | null;
          total_consultants: number | null;
        }>
      )
        .filter((s) => s.consultant_id === consultantId && s.role === role)
        .map((s) => ({
          consultant_id: s.consultant_id,
          role: s.role,
          year_month: s.year_month,
          ops_count: s.ops_count,
          net_fees: Number(s.net_fees),
          avg_cycle_days: s.avg_cycle_days === null ? null : Number(s.avg_cycle_days),
          rank: s.rank,
          total_consultants: s.total_consultants,
        })),
      leaderboardSnapshots: (
        (snaps ?? []) as Array<{
          consultant_id: string;
          role: Role;
          year_month: string;
          ops_count: number;
          net_fees: number;
          avg_cycle_days: number | null;
          rank: number | null;
          total_consultants: number | null;
        }>
      ).map((s) => ({
        consultant_id: s.consultant_id,
        role: s.role,
        year_month: s.year_month,
        ops_count: s.ops_count,
        net_fees: Number(s.net_fees),
        avg_cycle_days: s.avg_cycle_days === null ? null : Number(s.avg_cycle_days),
        rank: s.rank,
        total_consultants: s.total_consultants,
      })),
      streaks: (streaks ?? []).map((s) => ({
        consultant_id: s.consultant_id,
        role: s.role as Role,
        streak_type: s.streak_type,
        current_count: s.current_count,
        best_count: s.best_count,
        started_at: s.started_at,
        last_extended_at: s.last_extended_at,
        is_active: s.is_active,
      })),
      reviewerStats,
      partnerOpCounts,
    });

    const earnedTiers = (earnedByBadge.get(badge.key) ?? []).sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
    );
    const highest = earnedTiers.length ? earnedTiers[earnedTiers.length - 1]!.tier : null;
    const nextTier = pickNextTier(badge, highest);
    const nextThreshold = nextTier
      ? (badge.tiers.find((t) => t.tier === nextTier)?.threshold ?? null)
      : null;
    const progress = nextThreshold ? Math.min(1, ev.currentValue / nextThreshold) : highest ? 1 : 0;

    views.push({
      badge,
      earnedTiers,
      highestEarned: highest,
      nextTier,
      currentValue: ev.currentValue,
      progressLabel: ev.progressLabel,
      progressToNext: progress,
    });
  }

  return views;
}

function pickNextTier(badge: BadgeDefinition, earned: BadgeTier | null): BadgeTier | null {
  if (!earned) return badge.tiers[0]?.tier ?? null;
  const idx = badge.tiers.findIndex((t) => t.tier === earned);
  return badge.tiers[idx + 1]?.tier ?? null;
}

export const CATEGORY_ORDER: BadgeCategory[] = [
  "volume",
  "fees",
  "speed",
  "invoicing",
  "compliance",
  "consistency",
  "specialization",
  "quality",
  "rare",
  "personality",
  "team",
];

export const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  volume: "Volume",
  fees: "Fees",
  speed: "Speed",
  invoicing: "Invoicing",
  compliance: "Compliance",
  consistency: "Consistency",
  specialization: "Specialization",
  quality: "Quality",
  rare: "Rare",
  personality: "Personality",
  team: "Team",
};
