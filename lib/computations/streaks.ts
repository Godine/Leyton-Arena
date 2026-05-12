import type { SupabaseClient } from "@supabase/supabase-js";
import { OP_MACHINE_TIERS_FOR_STREAK } from "./streak-tiers";
import {
  daysBetween,
  preNotificationDeadline,
  sortByInvoiceAsc,
  yearMonthOf,
} from "@/lib/badges/helpers";
import type { ClaimAggregate, StreakLite } from "@/lib/types/domain";
import type { BadgeEarnedRow } from "@/lib/supabase/database.types";
import type { Role } from "@/lib/types";

export const STREAK_TYPES = {
  ironStreak: "iron_streak",
  prenotificationHawk: "prenotification_hawk",
  documentSniper: "document_sniper",
} as const;

/**
 * Compute every streak for a single consultant in one role, given their full
 * claim history in that role plus any existing Op Machine badge tier. Pure;
 * no DB calls.
 *
 * `opMachineTierThreshold` is the numeric monthly-ops threshold the
 * consultant must hit to extend their Iron Streak. The orchestrator derives
 * it from the consultant's highest currently-earned Op Machine tier, with
 * bronze (3) as the floor — meaning every consultant starts measuring an
 * Iron Streak against bronze until they earn a higher tier.
 */
export function computeStreaks(
  claims: ClaimAggregate[],
  role: Role,
  opMachineTierThreshold: number,
  asOfDate: Date,
): Array<Omit<StreakLite, "consultant_id">> {
  const validClaims = claims.filter((c) => c.is_valid_op);
  const sorted = sortByInvoiceAsc(validClaims);

  const iron = computeIronStreak(sorted, opMachineTierThreshold, asOfDate);
  const hawk = computePrenotificationHawk(sorted, asOfDate);
  const sniper =
    role === "financial" ? computeDocumentSniper(sorted, asOfDate) : nullStreak("document_sniper");

  return [
    { ...iron, role, streak_type: STREAK_TYPES.ironStreak },
    { ...hawk, role, streak_type: STREAK_TYPES.prenotificationHawk },
    { ...sniper, role, streak_type: STREAK_TYPES.documentSniper },
  ];
}

type StreakResult = Omit<StreakLite, "consultant_id" | "role" | "streak_type">;

function nullStreak(_type: string): StreakResult {
  return {
    current_count: 0,
    best_count: 0,
    started_at: null,
    last_extended_at: null,
    is_active: false,
  };
}

/**
 * Iron Streak — consecutive calendar months where the consultant met their
 * Op Machine threshold. The walk is over the full range from the earliest
 * delivered month to the latest, so any missing month resets the run.
 */
function computeIronStreak(
  claims: ClaimAggregate[],
  threshold: number,
  asOfDate: Date,
): StreakResult {
  if (claims.length === 0 || threshold <= 0) return nullStreak("iron_streak");
  const byMonth = new Map<string, number>();
  for (const c of claims) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
  }
  const months = enumerateMonths(byMonth);
  let run = 0;
  let best = 0;
  let started: string | null = null;
  let lastExtended: string | null = null;
  for (const ym of months) {
    const count = byMonth.get(ym) ?? 0;
    if (count >= threshold) {
      if (run === 0) started = `${ym}-01`;
      run += 1;
      lastExtended = `${ym}-01`;
      if (run > best) best = run;
    } else {
      run = 0;
      started = null;
    }
  }
  return {
    current_count: run,
    best_count: best,
    started_at: run > 0 ? started : null,
    last_extended_at: run > 0 ? lastExtended : null,
    is_active: run > 0 && isCurrentOrLastMonth(lastExtended, asOfDate),
  };
}

/**
 * Pre-Notification Hawk — consecutive valid ops where pre_notification was
 * required AND submitted on or before the 6-month-before-year-end deadline.
 * Ops where pre_notification was not required are skipped (they neither
 * extend nor break the streak).
 */
function computePrenotificationHawk(claims: ClaimAggregate[], asOfDate: Date): StreakResult {
  let run = 0;
  let best = 0;
  let started: string | null = null;
  let lastExtended: string | null = null;
  for (const c of claims) {
    if (!c.pre_notification_required) continue;
    const deadline = preNotificationDeadline(c);
    const ok =
      c.pre_notification_date !== null && deadline !== null && c.pre_notification_date <= deadline;
    if (ok) {
      if (run === 0) started = c.latest_invoice_date;
      run += 1;
      lastExtended = c.latest_invoice_date;
      if (run > best) best = run;
    } else {
      run = 0;
      started = null;
    }
  }
  return {
    current_count: run,
    best_count: best,
    started_at: run > 0 ? started : null,
    last_extended_at: run > 0 ? lastExtended : null,
    is_active: run > 0 && isWithinSixtyDays(lastExtended, asOfDate),
  };
}

/**
 * Document Sniper — consecutive financial ops where costs received within 7
 * days of handover. Ops missing either date count as a miss.
 */
function computeDocumentSniper(claims: ClaimAggregate[], asOfDate: Date): StreakResult {
  let run = 0;
  let best = 0;
  let started: string | null = null;
  let lastExtended: string | null = null;
  for (const c of claims) {
    const gap = daysBetween(c.handover_complete_date, c.costs_received_date);
    const ok = gap !== null && gap >= 0 && gap <= 7;
    if (ok) {
      if (run === 0) started = c.latest_invoice_date;
      run += 1;
      lastExtended = c.latest_invoice_date;
      if (run > best) best = run;
    } else {
      run = 0;
      started = null;
    }
  }
  return {
    current_count: run,
    best_count: best,
    started_at: run > 0 ? started : null,
    last_extended_at: run > 0 ? lastExtended : null,
    is_active: run > 0 && isWithinSixtyDays(lastExtended, asOfDate),
  };
}

function enumerateMonths(byMonth: Map<string, number>): string[] {
  const months = [...byMonth.keys()].sort();
  if (months.length === 0) return [];
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const out: string[] = [];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  if (!fy || !fm || !ly || !lm) return months;
  let y = fy;
  let m = fm;
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function isCurrentOrLastMonth(iso: string | null, asOf: Date): boolean {
  if (!iso) return false;
  const lastYM = iso.slice(0, 7);
  const curY = asOf.getUTCFullYear();
  const curM = asOf.getUTCMonth() + 1;
  const curYM = `${curY}-${String(curM).padStart(2, "0")}`;
  if (lastYM === curYM) return true;
  // Allow one-month grace so a streak from the previous month is still "active"
  // until that month rolls fully into the past.
  const prevDate = new Date(Date.UTC(curY, curM - 2, 1));
  const prevYM = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return lastYM === prevYM;
}

function isWithinSixtyDays(iso: string | null, asOf: Date): boolean {
  if (!iso) return false;
  const last = new Date(`${iso}T00:00:00Z`).getTime();
  const diff = asOf.getTime() - last;
  return diff <= 60 * 24 * 60 * 60 * 1000;
}

/**
 * Derive the per-consultant, per-role Iron Streak threshold from already-
 * earned Op Machine badges. Catalog tier thresholds are 3/5/8/12/15. If the
 * consultant has earned diamond, they need 15 ops/month going forward to
 * extend their Iron Streak; with no Op Machine earned yet the floor is the
 * bronze threshold of 3.
 */
export function ironStreakThresholdFromBadges(
  earned: Pick<BadgeEarnedRow, "badge_key" | "tier" | "role">[],
  role: Role,
): number {
  const tiers = earned
    .filter((b) => b.badge_key === "op_machine" && b.role === role)
    .map((b) => b.tier);
  // Map tier -> threshold via the catalog's Op Machine tier table.
  return tiers.reduce((max, tier) => {
    const t = OP_MACHINE_TIERS_FOR_STREAK[tier];
    return t !== undefined && t > max ? t : max;
  }, OP_MACHINE_TIERS_FOR_STREAK.bronze);
}

// ---------- DB-bound wrapper -----------------------------------------

/**
 * Recompute every streak for the given consultants, writing upserts to the
 * `streaks` table. Idempotent: a re-run with no underlying changes leaves
 * rows untouched (modulo the always-overwritten current/best counts).
 */
export async function recomputeStreaks(
  supabase: SupabaseClient,
  consultantIds: string[],
  asOfDate: Date = new Date(),
): Promise<{ upserted: number }> {
  const ids = [...new Set(consultantIds)].filter(Boolean);
  if (ids.length === 0) return { upserted: 0 };

  // Load every relevant claim aggregate across the affected consultants — we
  // need each consultant's full history because streaks are not localised.
  const { data: techClaims, error: techErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("lead_consultant_id", ids);
  if (techErr) throw new Error(`failed to load tech claims: ${techErr.message}`);
  const { data: finClaims, error: finErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .in("lead_expert_id", ids);
  if (finErr) throw new Error(`failed to load financial claims: ${finErr.message}`);

  const { data: earned, error: badgesErr } = await supabase
    .from("badges_earned")
    .select("consultant_id, badge_key, tier, role")
    .in("consultant_id", ids)
    .eq("badge_key", "op_machine");
  if (badgesErr) throw new Error(`failed to load badges: ${badgesErr.message}`);

  // Bucket claim_aggregates rows by consultant and role.
  const claimsByConsultant: Record<
    string,
    { technical: ClaimAggregate[]; financial: ClaimAggregate[] }
  > = {};
  for (const id of ids) claimsByConsultant[id] = { technical: [], financial: [] };
  for (const c of (techClaims ?? []) as ClaimAggregate[]) {
    if (c.lead_consultant_id && claimsByConsultant[c.lead_consultant_id]) {
      claimsByConsultant[c.lead_consultant_id]!.technical.push(decorateClaim(c));
    }
  }
  for (const c of (finClaims ?? []) as ClaimAggregate[]) {
    if (c.lead_expert_id && claimsByConsultant[c.lead_expert_id]) {
      claimsByConsultant[c.lead_expert_id]!.financial.push(decorateClaim(c));
    }
  }

  const upserts: Array<{
    consultant_id: string;
    role: Role;
    streak_type: string;
    current_count: number;
    best_count: number;
    started_at: string | null;
    last_extended_at: string | null;
    is_active: boolean;
  }> = [];

  for (const id of ids) {
    for (const role of ["technical", "financial"] as Role[]) {
      const claims = claimsByConsultant[id]?.[role] ?? [];
      if (claims.length === 0) continue;
      const threshold = ironStreakThresholdFromBadges(
        (earned ?? []).filter((b) => b.consultant_id === id),
        role,
      );
      const results = computeStreaks(claims, role, threshold, asOfDate);
      for (const r of results) {
        upserts.push({
          consultant_id: id,
          role,
          streak_type: r.streak_type,
          current_count: r.current_count,
          best_count: r.best_count,
          started_at: r.started_at,
          last_extended_at: r.last_extended_at,
          is_active: r.is_active,
        });
      }
    }
  }

  if (upserts.length === 0) return { upserted: 0 };

  let written = 0;
  for (let i = 0; i < upserts.length; i += 200) {
    const chunk = upserts.slice(i, i + 200);
    const { error } = await supabase
      .from("streaks")
      .upsert(chunk, { onConflict: "consultant_id,role,streak_type" });
    if (error) throw new Error(`failed to upsert streaks: ${error.message}`);
    written += chunk.length;
  }
  return { upserted: written };
}

/**
 * Decorate a raw DB row with the in-memory `claim_year` derived from the
 * claim reference, and coerce `net_amount` from string to number. The DB
 * row's numerics are JSON-encoded strings under the hood.
 */
function decorateClaim(row: ClaimAggregate): ClaimAggregate {
  const ref = row.claim_reference;
  const yMatch = ref.match(/-\s*(\d{4})\s*$/);
  const claim_year = yMatch ? Number(yMatch[1]) : null;
  return {
    ...row,
    net_amount: Number(row.net_amount),
    claim_year,
  };
}
