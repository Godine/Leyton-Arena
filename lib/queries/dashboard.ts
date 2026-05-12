import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_BY_KEY, BADGE_CATALOG } from "@/lib/badges/catalog";
import type { BadgeDefinition } from "@/lib/badges/catalog";
import { daysBetween, extractClaimYear, yearMonthOf } from "@/lib/badges/helpers";
import type { BadgeEarnedRow, ClaimAggregateRow } from "@/lib/supabase/database.types";
import type { Role, BadgeTier } from "@/lib/types";

/**
 * The pre-shaped data the dashboard server component needs. Everything
 * derives from `claim_aggregates`, `monthly_snapshots`, `badges_earned`,
 * `streaks`, and `records` — no Excel parsing happens here.
 */
export interface DashboardData {
  consultantId: string;
  role: Role;
  currentMonth: string; // YYYY-MM
  rank: { position: number; total: number } | null;
  stats: {
    opsThisMonth: number;
    netFeesThisMonth: number;
    avgCycleDays: number | null;
    /** For technical: handover -> tech writeup. For financial: handover -> costs received. */
    avgCycleLabel: string;
    ironStreak: { current: number; best: number };
    /** Subtitle hints; null when the next tier isn't useful to display. */
    opsHint: string | null;
    feesHint: string | null;
    cycleHint: string | null;
    streakHint: string | null;
  };
  highlightedBadges: BadgeHighlight[];
  /** Top 3 and the user's neighbours (above + below) for the leaderboard preview. */
  leaderboardPreview: LeaderboardEntry[];
  trend: Array<{ year_month: string; ops_count: number; net_fees: number }>;
  /** New badge keys earned since the consultant's last visit — drives the pulse. */
  freshlyEarnedKeys: string[];
}

export interface BadgeHighlight {
  badge: BadgeDefinition;
  earnedTier: BadgeTier | null;
  nextTier: BadgeTier | null;
  currentValue: number;
  progressToNext: number; // 0..1
  progressLabel: string | null;
  earnedAt: string | null;
}

export interface LeaderboardEntry {
  consultant_id: string;
  display_name: string;
  email: string | null;
  office: string | null;
  rank: number;
  ops_count: number;
  net_fees: number;
  is_self: boolean;
}

const TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "platinum", "diamond", "mythic"];

export async function loadDashboardData(
  supabase: SupabaseClient,
  consultantId: string,
  role: Role,
  lastVisitedAt: string | null,
): Promise<DashboardData> {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const previousMonth = shiftMonth(currentMonth, -1);

  const ownerColumn = role === "technical" ? "lead_consultant_id" : "lead_expert_id";

  // 1. This-month + prior 12 months of monthly_snapshots for the trend line.
  const trendStart = shiftMonth(currentMonth, -11);
  const { data: snaps } = await supabase
    .from("monthly_snapshots")
    .select(
      "consultant_id, role, year_month, ops_count, net_fees, avg_cycle_days, rank, total_consultants",
    )
    .eq("consultant_id", consultantId)
    .eq("role", role)
    .gte("year_month", trendStart)
    .lte("year_month", currentMonth)
    .order("year_month", { ascending: true });

  // 2. Current-month rank uses the snapshot if present; total_consultants is
  //    captured at snapshot time.
  const currentSnap = (snaps ?? []).find((s) => s.year_month === currentMonth) ?? null;
  const rank = currentSnap
    ? { position: currentSnap.rank ?? 0, total: currentSnap.total_consultants ?? 0 }
    : null;

  // 3. Top 3 + neighbours for leaderboard preview.
  const { data: monthSnaps } = await supabase
    .from("monthly_snapshots")
    .select("consultant_id, ops_count, net_fees, rank, total_consultants")
    .eq("role", role)
    .eq("year_month", currentMonth)
    .order("rank", { ascending: true });
  const consultantIds = (monthSnaps ?? []).map((s) => s.consultant_id);
  const { data: people } = consultantIds.length
    ? await supabase
        .from("consultants")
        .select("id, display_name, email, office")
        .in("id", consultantIds)
    : { data: [] };
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  const leaderboardAll: LeaderboardEntry[] = (monthSnaps ?? []).map((s) => {
    const person = peopleById.get(s.consultant_id);
    return {
      consultant_id: s.consultant_id,
      display_name: person?.display_name ?? "Unknown",
      email: person?.email ?? null,
      office: person?.office ?? null,
      rank: s.rank ?? 0,
      ops_count: s.ops_count,
      net_fees: Number(s.net_fees),
      is_self: s.consultant_id === consultantId,
    };
  });
  const leaderboardPreview = buildPreview(leaderboardAll, consultantId);

  // 4. Full lifetime claim history for this consultant in this role — drives
  //    stat cards (avg cycle), badge highlights, hint text.
  const { data: claimsRaw } = await supabase
    .from("claim_aggregates")
    .select("*")
    .eq(ownerColumn, consultantId);
  const claims = ((claimsRaw ?? []) as ClaimAggregateRow[]).map((c) => ({
    ...c,
    net_amount: Number(c.net_amount),
    claim_year: extractClaimYear(c.claim_reference),
  }));
  const validClaims = claims.filter((c) => c.is_valid_op);

  // 5. Stats.
  const monthClaims = validClaims.filter(
    (c) => yearMonthOf(c.latest_invoice_date) === currentMonth,
  );
  const opsThisMonth = monthClaims.length;
  const netFeesThisMonth =
    Math.round(monthClaims.reduce((s, c) => s + c.net_amount, 0) * 100) / 100;

  const cycleEnd = role === "technical" ? "tech_writeup_reviewed_date" : "costs_received_date";
  const cycles: number[] = [];
  for (const c of validClaims) {
    const d = daysBetween(c.handover_complete_date, c[cycleEnd] as string | null);
    if (d !== null && d >= 0) cycles.push(d);
  }
  const avgCycleDays = cycles.length
    ? Math.round((cycles.reduce((s, d) => s + d, 0) / cycles.length) * 10) / 10
    : null;
  const avgCycleLabel = role === "technical" ? "Avg tech cycle" : "Avg docs-received gap";

  // 6. Iron streak — read from `streaks` table.
  const { data: streakRows } = await supabase
    .from("streaks")
    .select("streak_type, current_count, best_count")
    .eq("consultant_id", consultantId)
    .eq("role", role);
  const iron = (streakRows ?? []).find((s) => s.streak_type === "iron_streak");
  const ironStreak = {
    current: iron?.current_count ?? 0,
    best: iron?.best_count ?? 0,
  };

  // 7. Stat hints — "1 more for X". Look up next-tier thresholds from the
  //    catalog so the dashboard updates if thresholds change.
  const opsHint = nextTierHint(opsThisMonth, "op_machine", "op");
  const feesHint = (() => {
    const lifetimeFees = validClaims.reduce((s, c) => s + c.net_amount, 0);
    const prevMonthSnap = (snaps ?? []).find((s) => s.year_month === previousMonth);
    if (!prevMonthSnap) return null;
    const delta = netFeesThisMonth - Number(prevMonthSnap.net_fees);
    if (Math.abs(delta) < 1) return "Flat vs last month";
    const sign = delta >= 0 ? "+" : "−";
    return `${sign}£${Math.round(Math.abs(delta)).toLocaleString()} vs last month · £${Math.round(lifetimeFees).toLocaleString()} lifetime`;
  })();
  const cycleHint =
    avgCycleDays === null
      ? "No cycle data yet"
      : avgCycleDays <= 14
        ? "Lightning fast"
        : avgCycleDays <= 21
          ? "Within standard"
          : "Room to tighten";
  const streakHint =
    ironStreak.current === 0
      ? "Hit your threshold this month to start a streak"
      : ironStreak.current >= ironStreak.best
        ? `Best ever (${ironStreak.best} months)`
        : `Best ever ${ironStreak.best}`;

  // 8. Badge highlights — top 4 most relevant for this consultant.
  const { data: earnedRows } = await supabase
    .from("badges_earned")
    .select("badge_key, role, tier, earned_at")
    .eq("consultant_id", consultantId)
    .eq("role", role);
  const earned = (earnedRows ?? []) as Pick<
    BadgeEarnedRow,
    "badge_key" | "role" | "tier" | "earned_at"
  >[];
  const earnedByBadge = new Map<string, Pick<BadgeEarnedRow, "tier" | "earned_at">[]>();
  for (const e of earned) {
    const arr = earnedByBadge.get(e.badge_key) ?? [];
    arr.push({ tier: e.tier, earned_at: e.earned_at });
    earnedByBadge.set(e.badge_key, arr);
  }

  const freshlyEarnedKeys = lastVisitedAt
    ? earned.filter((e) => e.earned_at > lastVisitedAt).map((e) => `${e.badge_key}|${e.tier}`)
    : [];

  const highlightedBadges = pickHighlightedBadges(role, earnedByBadge, validClaims);

  // 9. Trend.
  const trend = (snaps ?? []).map((s) => ({
    year_month: s.year_month,
    ops_count: s.ops_count,
    net_fees: Number(s.net_fees),
  }));

  return {
    consultantId,
    role,
    currentMonth,
    rank,
    stats: {
      opsThisMonth,
      netFeesThisMonth,
      avgCycleDays,
      avgCycleLabel,
      ironStreak,
      opsHint,
      feesHint,
      cycleHint,
      streakHint,
    },
    highlightedBadges,
    leaderboardPreview,
    trend,
    freshlyEarnedKeys,
  };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildPreview(all: LeaderboardEntry[], consultantId: string): LeaderboardEntry[] {
  if (all.length === 0) return [];
  const meIdx = all.findIndex((e) => e.consultant_id === consultantId);
  const top = all.slice(0, 3);
  if (meIdx === -1 || meIdx < 3) {
    // Self is already in the top 3 (or not on the board); just return top 5.
    return all.slice(0, 5);
  }
  const above = all[meIdx - 1];
  const me = all[meIdx]!;
  const below = all[meIdx + 1];
  const merged = [...top];
  if (above && !merged.some((e) => e.consultant_id === above.consultant_id)) merged.push(above);
  merged.push(me);
  if (below) merged.push(below);
  return merged;
}

function nextTierHint(value: number, badgeKey: string, noun: string): string | null {
  const badge = BADGE_BY_KEY[badgeKey];
  if (!badge) return null;
  for (const t of badge.tiers) {
    if (value < t.threshold) {
      const gap = t.threshold - value;
      return `${gap} more ${noun}${gap === 1 ? "" : "s"} for ${capitalize(t.tier)}`;
    }
  }
  return "Diamond unlocked";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Pick the four most interesting badges to display on the dashboard:
 * the highest-tier earned plus the most-progressed unearned. Always returns
 * exactly four entries when the catalog has that many candidates.
 */
function pickHighlightedBadges(
  role: Role,
  earnedByBadge: Map<string, Pick<BadgeEarnedRow, "tier" | "earned_at">[]>,
  claims: Array<{ is_valid_op: boolean; net_amount: number }>,
): BadgeHighlight[] {
  type Scored = BadgeHighlight & { score: number };
  const out: Scored[] = [];

  for (const badge of BADGE_CATALOG) {
    if (badge.role !== "both" && badge.role !== role) continue;
    const earnedTiers = (earnedByBadge.get(badge.key) ?? []).map((e) => e.tier);
    const highest = earnedTiers.length
      ? earnedTiers.reduce((best, t) => (tierRank(t) > tierRank(best) ? t : best), earnedTiers[0]!)
      : null;
    const nextTier = pickNextTier(badge, highest);
    const earnedTimes = earnedByBadge.get(badge.key) ?? [];
    const latestEarn =
      earnedTimes
        .map((e) => e.earned_at)
        .sort()
        .pop() ?? null;

    let progress = 0;
    let progressLabel: string | null = null;
    let currentValue = 0;
    if (highest === "diamond" || highest === "mythic") {
      progress = 1;
      progressLabel = "Maxed";
    } else if (nextTier) {
      // We need a *value* to display progress against. The badges' evaluators
      // need a richer input, so we use a small set of cheap heuristics here:
      // Op Machine, Bookings Beast, Heavyweight, Empire Builder.
      const heur = roughValueFor(badge, role, claims);
      if (heur !== null) {
        currentValue = heur;
        const threshold = badge.tiers.find((t) => t.tier === nextTier)!.threshold;
        progress = Math.min(1, currentValue / threshold);
        progressLabel = `${formatValue(badge, currentValue)} / ${formatValue(badge, threshold)}`;
      }
    }

    // Score: earned badges with a higher tier score higher; unearned but with
    // progress score lower; flat unscored badges last.
    let score = 0;
    if (highest) score = 100 + tierRank(highest) * 10;
    else if (progress > 0) score = 50 + Math.round(progress * 40);
    out.push({
      badge,
      earnedTier: highest,
      nextTier,
      currentValue,
      progressToNext: progress,
      progressLabel,
      earnedAt: latestEarn,
      score,
    });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ score: _score, ...rest }) => rest);
}

function tierRank(tier: BadgeTier): number {
  return TIER_ORDER.indexOf(tier);
}

function pickNextTier(badge: BadgeDefinition, earned: BadgeTier | null): BadgeTier | null {
  if (!earned) return badge.tiers[0]?.tier ?? null;
  const idx = badge.tiers.findIndex((t) => t.tier === earned);
  return badge.tiers[idx + 1]?.tier ?? null;
}

/**
 * Cheap-and-cheerful current-value lookup for the dashboard's progress
 * bars. Falls back to null when we don't have a quick proxy for the badge.
 * The badges page uses the full evaluator path; this is just for the
 * dashboard's at-a-glance hints.
 */
function roughValueFor(
  badge: BadgeDefinition,
  _role: Role,
  claims: Array<{ is_valid_op: boolean; net_amount: number }>,
): number | null {
  const valid = claims.filter((c) => c.is_valid_op);
  switch (badge.key) {
    case "bookings_beast":
      return valid.length;
    case "empire_builder":
      return Math.round(valid.reduce((s, c) => s + c.net_amount, 0) * 100) / 100;
    case "heavyweight":
      return valid.reduce((m, c) => (c.net_amount > m ? c.net_amount : m), 0);
    default:
      return null;
  }
}

function formatValue(badge: BadgeDefinition, value: number): string {
  if (badge.category === "fees") {
    return `£${Math.round(value).toLocaleString()}`;
  }
  return `${Math.round(value)}`;
}
