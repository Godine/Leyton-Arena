/**
 * Leyton Arena — Badge Catalog.
 *
 * Every badge is defined here as a const entry with a pure-function evaluator.
 * Evaluators receive a fully-prepared `BadgeEvaluatorInput` and return an
 * evaluation describing which tiers are earned, the current progress value,
 * and a short label. The orchestrator in `lib/computations/badges.ts` walks
 * the catalog for each consultant/role and persists new tier unlocks.
 *
 * The catalog mirrors Appendix B of the build brief — keep the threshold
 * tables here in sync with that document. Categories: volume, fees, speed,
 * invoicing, compliance, consistency, specialization, quality, rare,
 * personality, team.
 */
import type { BadgeTier, Role } from "@/lib/types";
import type { BadgeEvaluation, BadgeEvaluatorInput, ClaimAggregate } from "@/lib/types/domain";
import {
  dayOfMonth,
  daysBetween,
  isLast5DaysOfMonth,
  monthsBetween,
  preNotificationDeadline,
  sortByInvoiceAsc,
  tiersEarned,
  weeksTouched,
  yearMonthOf,
} from "./helpers";

// ---------- Types -----------------------------------------------------

export type BadgeCategory =
  | "volume"
  | "fees"
  | "speed"
  | "invoicing"
  | "compliance"
  | "consistency"
  | "specialization"
  | "quality"
  | "rare"
  | "personality"
  | "team";

export interface BadgeTierThreshold {
  tier: BadgeTier;
  threshold: number;
  thresholdLabel: string;
}

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  /**
   * Which role(s) can earn this badge. `both` means the engine evaluates it
   * once per role the consultant has data in, persisting separate
   * `badges_earned` rows for each.
   */
  role: Role | "both";
  category: BadgeCategory;
  /** Lucide icon name. */
  icon: string;
  tiers: BadgeTierThreshold[];
  evaluate: (input: BadgeEvaluatorInput) => BadgeEvaluation;
}

// ---------- Tier helpers ---------------------------------------------

const tierTable = (rows: Array<[BadgeTier, number, string]>): BadgeTierThreshold[] =>
  rows.map(([tier, threshold, thresholdLabel]) => ({ tier, threshold, thresholdLabel }));

const MYTHIC = (threshold: number, label: string): BadgeTierThreshold[] => [
  { tier: "mythic", threshold, thresholdLabel: label },
];

const validOps = (claims: ClaimAggregate[]) => claims.filter((c) => c.is_valid_op);

// Threshold tables reused across badges.
const RECURRENCE_LIGHTNING = tierTable([
  ["bronze", 1, "1 op"],
  ["silver", 3, "3 ops"],
  ["gold", 5, "5 ops"],
  ["platinum", 10, "10 ops"],
  ["diamond", 20, "20 ops"],
]);

// ---------- Evaluators -----------------------------------------------

/** Op Machine — net-valid ops in a calendar month. */
function evaluateOpMachine(input: BadgeEvaluatorInput): BadgeEvaluation {
  // Best month ever: max ops in any year-month. That's the current value
  // a badge tier is unlocked against, so this badge is sticky (you keep the
  // bronze you earned last March even if April was quiet).
  const counts = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  let bestCount = 0;
  let bestMonth = "";
  for (const [ym, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      bestMonth = ym;
    }
  }
  return {
    currentValue: bestCount,
    earnedTiers: tiersEarned(bestCount, OP_MACHINE_TIERS),
    progressLabel: bestMonth ? `Best month: ${bestCount} ops (${bestMonth})` : "No valid ops yet",
    progressData: { bestMonth, bestCount, monthlyCounts: Object.fromEntries(counts) },
  };
}

const OP_MACHINE_TIERS = tierTable([
  ["bronze", 3, "3 ops"],
  ["silver", 5, "5 ops"],
  ["gold", 8, "8 ops"],
  ["platinum", 12, "12 ops"],
  ["diamond", 15, "15 ops"],
]);

/** Bookings Beast — lifetime valid ops. */
function evaluateBookingsBeast(input: BadgeEvaluatorInput): BadgeEvaluation {
  const total = validOps(input.claimAggregates).length;
  return {
    currentValue: total,
    earnedTiers: tiersEarned(total, BOOKINGS_BEAST_TIERS),
    progressLabel: `${total} lifetime ops`,
    progressData: { total },
  };
}
const BOOKINGS_BEAST_TIERS = tierTable([
  ["bronze", 25, "25 ops"],
  ["silver", 50, "50 ops"],
  ["gold", 100, "100 ops"],
  ["platinum", 200, "200 ops"],
  ["diamond", 500, "500 ops"],
]);

/** Heavyweight — largest single-op net fee. */
function evaluateHeavyweight(input: BadgeEvaluatorInput): BadgeEvaluation {
  let max = 0;
  let maxClaim = "";
  for (const c of validOps(input.claimAggregates)) {
    if (c.net_amount > max) {
      max = c.net_amount;
      maxClaim = c.claim_reference;
    }
  }
  return {
    currentValue: max,
    earnedTiers: tiersEarned(max, HEAVYWEIGHT_TIERS),
    progressLabel: maxClaim ? `Largest op: £${max.toLocaleString()}` : "No valid ops yet",
    progressData: { max, claim: maxClaim },
  };
}
const HEAVYWEIGHT_TIERS = tierTable([
  ["bronze", 5_000, "£5k"],
  ["silver", 15_000, "£15k"],
  ["gold", 30_000, "£30k"],
  ["platinum", 60_000, "£60k"],
  ["diamond", 100_000, "£100k"],
]);

/** The Whale — mythic, single op ≥ £75k. */
function evaluateTheWhale(input: BadgeEvaluatorInput): BadgeEvaluation {
  const big = validOps(input.claimAggregates).filter((c) => c.net_amount >= 75_000);
  return {
    currentValue: big.length,
    earnedTiers: big.length > 0 ? ["mythic"] : [],
    progressLabel: big.length > 0 ? `${big.length} whale op(s)` : "No op ≥ £75k yet",
    progressData: { count: big.length, claims: big.map((c) => c.claim_reference) },
  };
}

/** Empire Builder — lifetime net fees. */
function evaluateEmpireBuilder(input: BadgeEvaluatorInput): BadgeEvaluation {
  const total = validOps(input.claimAggregates).reduce((s, c) => s + c.net_amount, 0);
  const rounded = Math.round(total * 100) / 100;
  return {
    currentValue: rounded,
    earnedTiers: tiersEarned(rounded, EMPIRE_BUILDER_TIERS),
    progressLabel: `£${rounded.toLocaleString()} lifetime fees`,
    progressData: { total: rounded },
  };
}
const EMPIRE_BUILDER_TIERS = tierTable([
  ["bronze", 100_000, "£100k"],
  ["silver", 500_000, "£500k"],
  ["gold", 1_000_000, "£1M"],
  ["platinum", 3_000_000, "£3M"],
  ["diamond", 10_000_000, "£10M"],
]);

/**
 * Lightning Rod — handover→tech writeup reviewed ≤ 14 days. Tier by
 * recurrence (1/3/5/10/20). Technical only.
 */
function evaluateLightningRod(input: BadgeEvaluatorInput): BadgeEvaluation {
  const ops = validOps(input.claimAggregates).filter((c) => {
    const d = daysBetween(c.handover_complete_date, c.tech_writeup_reviewed_date);
    return d !== null && d <= 14 && d >= 0;
  });
  return {
    currentValue: ops.length,
    earnedTiers: tiersEarned(ops.length, RECURRENCE_LIGHTNING),
    progressLabel: `${ops.length} op(s) under 14d cycle`,
    progressData: { count: ops.length, claims: ops.map((c) => c.claim_reference) },
  };
}

/** Speed Demon — mythic, sub-7-day tech cycle. Technical only. */
function evaluateSpeedDemon(input: BadgeEvaluatorInput): BadgeEvaluation {
  const ops = validOps(input.claimAggregates).filter((c) => {
    const d = daysBetween(c.handover_complete_date, c.tech_writeup_reviewed_date);
    return d !== null && d < 7 && d >= 0;
  });
  return {
    currentValue: ops.length,
    earnedTiers: ops.length > 0 ? ["mythic"] : [],
    progressLabel: ops.length > 0 ? `${ops.length} sub-7d cycle(s)` : "No sub-7d cycles yet",
    progressData: { count: ops.length, claims: ops.map((c) => c.claim_reference) },
  };
}

/**
 * Express Lane — 3 valid ops in a row each ≤ 21 days, tier by recurrence of
 * the streak event (each completed 3-in-a-row counts as one occurrence).
 * Technical only.
 */
function evaluateExpressLane(input: BadgeEvaluatorInput): BadgeEvaluation {
  const sorted = sortByInvoiceAsc(validOps(input.claimAggregates));
  let run = 0;
  let occurrences = 0;
  for (const c of sorted) {
    const d = daysBetween(c.handover_complete_date, c.tech_writeup_reviewed_date);
    const fast = d !== null && d <= 21 && d >= 0;
    if (fast) {
      run += 1;
      if (run >= 3) {
        occurrences += 1;
        // Don't reset the run; an unbroken streak of N gives N - 2
        // occurrences, which matches the "tier by recurrence of the streak
        // event" reading.
      }
    } else {
      run = 0;
    }
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, RECURRENCE_LIGHTNING),
    progressLabel: `${occurrences} 3-in-a-row sub-21d streak(s)`,
    progressData: { occurrences },
  };
}

/** Number Cruncher Express — fin equivalent of Lightning Rod. */
function evaluateNumberCruncherExpress(input: BadgeEvaluatorInput): BadgeEvaluation {
  const ops = validOps(input.claimAggregates).filter((c) => {
    const d = daysBetween(c.handover_complete_date, c.cost_assessment_reviewed_date);
    return d !== null && d <= 14 && d >= 0;
  });
  return {
    currentValue: ops.length,
    earnedTiers: tiersEarned(ops.length, RECURRENCE_LIGHTNING),
    progressLabel: `${ops.length} op(s) under 14d cycle`,
    progressData: { count: ops.length, claims: ops.map((c) => c.claim_reference) },
  };
}

/** Document Sniper — costs received ≤ 7 days after handover. Financial only. */
function evaluateDocumentSniper(input: BadgeEvaluatorInput): BadgeEvaluation {
  const ops = validOps(input.claimAggregates).filter((c) => {
    const d = daysBetween(c.handover_complete_date, c.costs_received_date);
    return d !== null && d <= 7 && d >= 0;
  });
  return {
    currentValue: ops.length,
    earnedTiers: tiersEarned(ops.length, DOC_SNIPER_TIERS),
    progressLabel: `${ops.length} fast-doc op(s)`,
    progressData: { count: ops.length, claims: ops.map((c) => c.claim_reference) },
  };
}
const DOC_SNIPER_TIERS = tierTable([
  ["bronze", 3, "3 ops"],
  ["silver", 10, "10 ops"],
  ["gold", 25, "25 ops"],
  ["platinum", 50, "50 ops"],
  ["diamond", 100, "100 ops"],
]);

/**
 * Paper Trail Pro — mythic: 10 consecutive valid ops with both financial
 * docs and costs received within 14 days of handover. Financial only.
 */
function evaluatePaperTrailPro(input: BadgeEvaluatorInput): BadgeEvaluation {
  const sorted = sortByInvoiceAsc(validOps(input.claimAggregates));
  let run = 0;
  let best = 0;
  for (const c of sorted) {
    const d1 = daysBetween(c.handover_complete_date, c.financial_documents_received_date);
    const d2 = daysBetween(c.handover_complete_date, c.costs_received_date);
    const ok = d1 !== null && d1 >= 0 && d1 <= 14 && d2 !== null && d2 >= 0 && d2 <= 14;
    if (ok) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return {
    currentValue: best,
    earnedTiers: best >= 10 ? ["mythic"] : [],
    progressLabel: `Best fast-docs streak: ${best}`,
    progressData: { best, current: run },
  };
}

/**
 * Early Bird — invoice raised same day as the relevant review (tech for
 * technical, cost assessment for financial).
 */
function evaluateEarlyBird(input: BadgeEvaluatorInput): BadgeEvaluation {
  const field: keyof ClaimAggregate =
    input.role === "technical" ? "tech_writeup_reviewed_date" : "cost_assessment_reviewed_date";
  const ops = validOps(input.claimAggregates).filter((c) => {
    const review = c[field] as string | null;
    return review !== null && review === c.latest_invoice_date;
  });
  return {
    currentValue: ops.length,
    earnedTiers: tiersEarned(ops.length, EARLY_BIRD_TIERS),
    progressLabel: `${ops.length} same-day invoice(s)`,
    progressData: { count: ops.length, claims: ops.map((c) => c.claim_reference) },
  };
}
const EARLY_BIRD_TIERS = tierTable([
  ["bronze", 5, "5 ops"],
  ["silver", 15, "15 ops"],
  ["gold", 30, "30 ops"],
  ["platinum", 50, "50 ops"],
  ["diamond", 100, "100 ops"],
]);

/**
 * Cash Flow King — mythic: 3 consecutive months with majority of valid ops
 * invoiced in the first 10 days.
 */
function evaluateCashFlowKing(input: BadgeEvaluatorInput): BadgeEvaluation {
  const byMonth = new Map<string, { early: number; total: number }>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    const entry = byMonth.get(ym) ?? { early: 0, total: 0 };
    entry.total += 1;
    if (dayOfMonth(c.latest_invoice_date) <= 10) entry.early += 1;
    byMonth.set(ym, entry);
  }
  const months = [...byMonth.keys()].sort();
  let run = 0;
  let best = 0;
  let prev: string | null = null;
  for (const ym of months) {
    const m = byMonth.get(ym)!;
    const majority = m.total > 0 && m.early * 2 > m.total;
    if (!majority) {
      run = 0;
      prev = ym;
      continue;
    }
    if (prev === null) {
      run = 1;
    } else {
      // ym must immediately follow prev to extend run
      const expectedNext = nextMonth(prev);
      run = expectedNext === ym ? run + 1 : 1;
    }
    if (run > best) best = run;
    prev = ym;
  }
  return {
    currentValue: best,
    earnedTiers: best >= 3 ? ["mythic"] : [],
    progressLabel: `Best run: ${best} month(s)`,
    progressData: { best },
  };
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/**
 * Pre-Notification Hawk — streak length of correctly-submitted
 * pre-notifications when required. Tier reads off the streak record's
 * best_count if present, else from claim history directly.
 */
function evaluatePreNotificationHawk(input: BadgeEvaluatorInput): BadgeEvaluation {
  const fromStreak =
    input.streaks.find((s) => s.streak_type === "prenotification_hawk")?.best_count ?? 0;
  // Fallback compute if streaks haven't been recomputed for some reason —
  // keeps evaluators self-contained.
  const fallback = bestPreNotificationHawkStreak(input.claimAggregates);
  const best = Math.max(fromStreak, fallback);
  return {
    currentValue: best,
    earnedTiers: tiersEarned(best, PRE_NOTIF_HAWK_TIERS),
    progressLabel: `Best streak: ${best}`,
    progressData: { best, fromStreak, fallback },
  };
}
const PRE_NOTIF_HAWK_TIERS = tierTable([
  ["bronze", 5, "5 ops"],
  ["silver", 15, "15 ops"],
  ["gold", 30, "30 ops"],
  ["platinum", 60, "60 ops"],
  ["diamond", 100, "100 ops"],
]);

function bestPreNotificationHawkStreak(claims: ClaimAggregate[]): number {
  const sorted = sortByInvoiceAsc(validOps(claims).filter((c) => c.pre_notification_required));
  let run = 0;
  let best = 0;
  for (const c of sorted) {
    const deadline = preNotificationDeadline(c);
    const ok =
      c.pre_notification_date !== null && deadline !== null && c.pre_notification_date <= deadline;
    if (ok) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** Risk Slayer — count of valid ops with on-time pre-notification. */
function evaluateRiskSlayer(input: BadgeEvaluatorInput): BadgeEvaluation {
  const ok = validOps(input.claimAggregates).filter((c) => {
    if (!c.pre_notification_required) return false;
    const deadline = preNotificationDeadline(c);
    return (
      c.pre_notification_date !== null && deadline !== null && c.pre_notification_date <= deadline
    );
  });
  return {
    currentValue: ok.length,
    earnedTiers: tiersEarned(ok.length, RISK_SLAYER_TIERS),
    progressLabel: `${ok.length} on-time pre-notification(s)`,
    progressData: { count: ok.length, claims: ok.map((c) => c.claim_reference) },
  };
}
const RISK_SLAYER_TIERS = tierTable([
  ["bronze", 3, "3 ops"],
  ["silver", 10, "10 ops"],
  ["gold", 25, "25 ops"],
  ["platinum", 50, "50 ops"],
  ["diamond", 100, "100 ops"],
]);

/**
 * Zero Slippage — mythic, 6 consecutive months with zero missed
 * pre-notifications. "Missed" = required but submitted late or not at all.
 */
function evaluateZeroSlippage(input: BadgeEvaluatorInput): BadgeEvaluation {
  const monthsWithMiss = new Set<string>();
  const monthsWithReq = new Set<string>();
  for (const c of validOps(input.claimAggregates)) {
    if (!c.pre_notification_required) continue;
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    monthsWithReq.add(ym);
    const deadline = preNotificationDeadline(c);
    const ok =
      c.pre_notification_date !== null && deadline !== null && c.pre_notification_date <= deadline;
    if (!ok) monthsWithMiss.add(ym);
  }
  const cleanMonths = [...monthsWithReq].filter((m) => !monthsWithMiss.has(m)).sort();
  // Walk the run of consecutive clean months.
  let run = 0;
  let best = 0;
  let prev: string | null = null;
  for (const ym of cleanMonths) {
    if (prev === null || nextMonth(prev) === ym) {
      run = prev === null ? 1 : run + 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = ym;
  }
  return {
    currentValue: best,
    earnedTiers: best >= 6 ? ["mythic"] : [],
    progressLabel: `Best clean run: ${best} month(s)`,
    progressData: { best, cleanMonthCount: cleanMonths.length },
  };
}

/** Iron Streak — best consecutive-month streak hitting Op Machine threshold. */
function evaluateIronStreak(input: BadgeEvaluatorInput): BadgeEvaluation {
  const fromStreak = input.streaks.find((s) => s.streak_type === "iron_streak")?.best_count ?? 0;
  return {
    currentValue: fromStreak,
    earnedTiers: tiersEarned(fromStreak, IRON_STREAK_TIERS),
    progressLabel: `Best run: ${fromStreak} month(s)`,
    progressData: { best: fromStreak },
  };
}
const IRON_STREAK_TIERS = tierTable([
  ["bronze", 3, "3 months"],
  ["silver", 6, "6 months"],
  ["gold", 9, "9 months"],
  ["platinum", 12, "12 months"],
  ["diamond", 18, "18 months"],
]);

/** The Standard — mythic: 12 consecutive months at Op Machine threshold. */
function evaluateTheStandard(input: BadgeEvaluatorInput): BadgeEvaluation {
  const fromStreak = input.streaks.find((s) => s.streak_type === "iron_streak")?.best_count ?? 0;
  return {
    currentValue: fromStreak,
    earnedTiers: fromStreak >= 12 ? ["mythic"] : [],
    progressLabel: `Best run: ${fromStreak} month(s)`,
    progressData: { best: fromStreak },
  };
}

/** Showing Up — count of calendar months where ops landed in every week. */
function evaluateShowingUp(input: BadgeEvaluatorInput): BadgeEvaluation {
  const byMonth = new Map<string, string[]>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    const arr = byMonth.get(ym) ?? [];
    arr.push(c.latest_invoice_date);
    byMonth.set(ym, arr);
  }
  let count = 0;
  for (const [ym, dates] of byMonth) {
    const weeksInMonth = expectedWeeks(ym);
    const touched = weeksTouched(dates, ym);
    if (touched >= weeksInMonth) count += 1;
  }
  return {
    currentValue: count,
    earnedTiers: tiersEarned(count, SHOWING_UP_TIERS),
    progressLabel: `${count} every-week month(s)`,
    progressData: { count },
  };
}
const SHOWING_UP_TIERS = tierTable([
  ["bronze", 1, "1 month"],
  ["silver", 3, "3 months"],
  ["gold", 6, "6 months"],
  ["platinum", 12, "12 months"],
  ["diamond", 24, "24 months"],
]);

function expectedWeeks(ym: string): number {
  // Minimum distinct ISO weeks any calendar month touches is 4; some touch 5
  // or 6. Computing the precise expected count keeps the badge fair for
  // short months.
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 4;
  const dates: string[] = [];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return weeksTouched(dates, ym);
}

/**
 * Year-End Surgeon — lifetime count of (calendar month containing 5+ valid
 * ops with the same year-end month).
 */
function evaluateYearEndSurgeon(input: BadgeEvaluatorInput): BadgeEvaluation {
  // group by (year_month_of_delivery, year_end_month)
  const counts = new Map<string, Map<string, number>>();
  for (const c of validOps(input.claimAggregates)) {
    if (!c.year_end_month) continue;
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    const inner = counts.get(ym) ?? new Map<string, number>();
    inner.set(c.year_end_month, (inner.get(c.year_end_month) ?? 0) + 1);
    counts.set(ym, inner);
  }
  let occurrences = 0;
  for (const inner of counts.values()) {
    for (const n of inner.values()) {
      if (n >= 5) occurrences += 1;
    }
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, YEAR_END_SURGEON_TIERS),
    progressLabel: `${occurrences} surgeon month(s)`,
    progressData: { occurrences },
  };
}
const YEAR_END_SURGEON_TIERS = tierTable([
  ["bronze", 5, "5 times"],
  ["silver", 10, "10 times"],
  ["gold", 25, "25 times"],
  ["platinum", 50, "50 times"],
  ["diamond", 100, "100 times"],
]);

/**
 * The Specialist — max count of lifetime valid ops on any single product.
 * Threshold compares against the largest single product's count.
 */
function evaluateTheSpecialist(input: BadgeEvaluatorInput): BadgeEvaluation {
  const counts = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    if (!c.product) continue;
    counts.set(c.product, (counts.get(c.product) ?? 0) + 1);
  }
  let bestProduct = "";
  let bestCount = 0;
  for (const [p, n] of counts) {
    if (n > bestCount) {
      bestCount = n;
      bestProduct = p;
    }
  }
  return {
    currentValue: bestCount,
    earnedTiers: tiersEarned(bestCount, BOOKINGS_BEAST_TIERS),
    progressLabel: bestProduct ? `${bestCount} ${bestProduct} ops` : "No valid ops yet",
    progressData: { bestProduct, bestCount, byProduct: Object.fromEntries(counts) },
  };
}

/** Trusted Pair — completed tech writeup reviews (lifetime count). */
function evaluateTrustedPair(input: BadgeEvaluatorInput): BadgeEvaluation {
  const n = input.reviewerStats.techWriteupCount;
  return {
    currentValue: n,
    earnedTiers: tiersEarned(n, REVIEWER_TIERS),
    progressLabel: `${n} tech writeups reviewed`,
    progressData: { count: n },
  };
}

/** The Gatekeeper — completed cost assessment reviews. */
function evaluateTheGatekeeper(input: BadgeEvaluatorInput): BadgeEvaluation {
  const n = input.reviewerStats.costAssessmentCount;
  return {
    currentValue: n,
    earnedTiers: tiersEarned(n, REVIEWER_TIERS),
    progressLabel: `${n} cost assessments reviewed`,
    progressData: { count: n },
  };
}
const REVIEWER_TIERS = tierTable([
  ["bronze", 25, "25 reviews"],
  ["silver", 75, "75 reviews"],
  ["gold", 150, "150 reviews"],
  ["platinum", 250, "250 reviews"],
  ["diamond", 500, "500 reviews"],
]);

/**
 * The Triple Threat — mythic: appear as lead consultant, lead expert AND
 * reviewer (either tech writeup or cost assessment) within a single calendar
 * month. Detected against this consultant's own claims plus the reviewer
 * stats.
 */
function evaluateTripleThreat(input: BadgeEvaluatorInput): BadgeEvaluation {
  // We don't have full per-month reviewer activity in the input — but we do
  // have per-claim reviewer ids on every claim. Walk all claims for this
  // consultant across both roles' delivery months.
  const monthRoles = new Map<string, Set<string>>();
  for (const c of input.claimAggregates) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    const set = monthRoles.get(ym) ?? new Set<string>();
    if (c.lead_consultant_id === input.consultantId) set.add("lead_consultant");
    if (c.lead_expert_id === input.consultantId) set.add("lead_expert");
    if (
      c.tech_writeup_reviewer_id === input.consultantId ||
      c.cost_assessment_reviewer_id === input.consultantId
    ) {
      set.add("reviewer");
    }
    monthRoles.set(ym, set);
  }
  let hit = false;
  let hitMonth: string | null = null;
  for (const [ym, roles] of monthRoles) {
    if (roles.has("lead_consultant") && roles.has("lead_expert") && roles.has("reviewer")) {
      hit = true;
      hitMonth = ym;
      break;
    }
  }
  return {
    currentValue: hit ? 1 : 0,
    earnedTiers: hit ? ["mythic"] : [],
    progressLabel: hit ? `Triple threat in ${hitMonth}` : "Not yet a triple threat",
    progressData: { hit, hitMonth },
  };
}

/** Hat Trick — count of months with 3+ ops above £20k net. */
function evaluateHatTrick(input: BadgeEvaluatorInput): BadgeEvaluation {
  const byMonth = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    if (c.net_amount < 20_000) continue;
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
  }
  let occurrences = 0;
  for (const n of byMonth.values()) if (n >= 3) occurrences += 1;
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, HAT_TRICK_TIERS),
    progressLabel: `${occurrences} hat-trick month(s)`,
    progressData: { occurrences },
  };
}
const HAT_TRICK_TIERS = tierTable([
  ["bronze", 1, "1 time"],
  ["silver", 3, "3 times"],
  ["gold", 8, "8 times"],
  ["platinum", 15, "15 times"],
  ["diamond", 25, "25 times"],
]);

/** Quadfecta — mythic, ops across 4 different year-end months in a single calendar month. */
function evaluateQuadfecta(input: BadgeEvaluatorInput): BadgeEvaluation {
  const byMonth = new Map<string, Set<string>>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym || !c.year_end_month) continue;
    const set = byMonth.get(ym) ?? new Set<string>();
    set.add(c.year_end_month);
    byMonth.set(ym, set);
  }
  let hit = false;
  let hitMonth: string | null = null;
  for (const [ym, set] of byMonth) {
    if (set.size >= 4) {
      hit = true;
      hitMonth = ym;
      break;
    }
  }
  return {
    currentValue: hit ? 1 : 0,
    earnedTiers: hit ? ["mythic"] : [],
    progressLabel: hit ? `Quadfecta in ${hitMonth}` : "Not yet a quadfecta",
    progressData: { hit, hitMonth },
  };
}

/**
 * Comeback Kid — count of months where the consultant hit their personal Op
 * Machine bronze threshold (3) after a sub-threshold previous month.
 */
function evaluateComebackKid(input: BadgeEvaluatorInput): BadgeEvaluation {
  const byMonth = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
  }
  const earliest = [...byMonth.keys()].sort()[0];
  const latest = [...byMonth.keys()].sort().pop();
  let occurrences = 0;
  if (earliest && latest) {
    const months = monthsBetween(`${earliest}-01`, `${latest}-01`);
    let prev = 0;
    for (const ym of months) {
      const curr = byMonth.get(ym) ?? 0;
      if (curr >= 3 && prev < 3) occurrences += 1;
      prev = curr;
    }
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, COMEBACK_KID_TIERS),
    progressLabel: `${occurrences} comeback(s)`,
    progressData: { occurrences },
  };
}
const COMEBACK_KID_TIERS = tierTable([
  ["bronze", 1, "1 time"],
  ["silver", 3, "3 times"],
  ["gold", 6, "6 times"],
  ["platinum", 10, "10 times"],
  ["diamond", 20, "20 times"],
]);

/**
 * Built Different — count of monthly leaderboard wins where the consultant
 * led second place by ≥30%. Requires the role's full leaderboard snapshots.
 */
function evaluateBuiltDifferent(input: BadgeEvaluatorInput): BadgeEvaluation {
  // Group all leaderboard snapshots by year_month to find first/second place.
  const byMonth = new Map<string, typeof input.leaderboardSnapshots>();
  for (const s of input.leaderboardSnapshots) {
    if (s.role !== input.role) continue;
    const arr = byMonth.get(s.year_month) ?? [];
    arr.push(s);
    byMonth.set(s.year_month, arr);
  }
  let wins = 0;
  const winningMonths: string[] = [];
  for (const [ym, snaps] of byMonth) {
    snaps.sort((a, b) => b.ops_count - a.ops_count || b.net_fees - a.net_fees);
    const first = snaps[0];
    const second = snaps[1];
    if (!first || first.consultant_id !== input.consultantId) continue;
    const lead = second && second.ops_count > 0 ? first.ops_count / second.ops_count - 1 : Infinity;
    if (lead >= 0.3) {
      wins += 1;
      winningMonths.push(ym);
    }
  }
  return {
    currentValue: wins,
    earnedTiers: tiersEarned(wins, BUILT_DIFFERENT_TIERS),
    progressLabel: `${wins} dominant month-win(s)`,
    progressData: { wins, winningMonths },
  };
}
const BUILT_DIFFERENT_TIERS = tierTable([
  ["bronze", 1, "1 time"],
  ["silver", 3, "3 times"],
  ["gold", 6, "6 times"],
  ["platinum", 12, "12 times"],
  ["diamond", 24, "24 times"],
]);

/** No Days Off — count of 3+ consecutive-calendar-day delivery runs. */
function evaluateNoDaysOff(input: BadgeEvaluatorInput): BadgeEvaluation {
  const days = new Set<string>();
  for (const c of validOps(input.claimAggregates)) days.add(c.latest_invoice_date);
  const sorted = [...days].sort();
  let run = 1;
  let occurrences = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = daysBetween(sorted[i - 1] ?? null, sorted[i] ?? null);
    if (diff === 1) {
      run += 1;
      if (run === 3) occurrences += 1;
    } else {
      run = 1;
    }
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, COMEBACK_KID_TIERS),
    progressLabel: `${occurrences} 3-day delivery run(s)`,
    progressData: { occurrences },
  };
}

/** First Past the Post — count of 3-month-in-a-row "first op of the month" runs. */
function evaluateFirstPastThePost(input: BadgeEvaluatorInput): BadgeEvaluation {
  // We don't know if this consultant was first across the firm for the
  // month — only their own claims. So this counts consecutive months in
  // which their earliest op landed on the 1st of the month (the strictest
  // intra-consultant interpretation). The cross-firm version belongs to
  // Built Different / The Closer.
  const ymToFirstDay = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    const day = dayOfMonth(c.latest_invoice_date);
    const cur = ymToFirstDay.get(ym);
    if (cur === undefined || day < cur) ymToFirstDay.set(ym, day);
  }
  const months = [...ymToFirstDay.keys()].sort();
  let run = 0;
  let occurrences = 0;
  let prev: string | null = null;
  for (const ym of months) {
    const day = ymToFirstDay.get(ym)!;
    const isFirst = day === 1;
    if (!isFirst) {
      run = 0;
      prev = ym;
      continue;
    }
    if (prev === null || nextMonth(prev) !== ym) {
      run = 1;
    } else {
      run += 1;
    }
    if (run === 3) occurrences += 1;
    prev = ym;
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, FIRST_PAST_THE_POST_TIERS),
    progressLabel: `${occurrences} 3-month "first" run(s)`,
    progressData: { occurrences },
  };
}
const FIRST_PAST_THE_POST_TIERS = tierTable([
  ["bronze", 1, "1 time"],
  ["silver", 3, "3 times"],
  ["gold", 5, "5 times"],
  ["platinum", 8, "8 times"],
  ["diamond", 12, "12 times"],
]);

/** The Closer — months where the consultant had the most ops in the last 5 days. */
function evaluateTheCloser(input: BadgeEvaluatorInput): BadgeEvaluation {
  // Compute, per month, the count of last-5-day valid ops by every consultant
  // in this role using leaderboardSnapshots — but snapshots don't capture
  // that granularity. Fall back to counting months where THIS consultant
  // had ≥3 last-5-day ops (a reasonable per-consultant proxy until the
  // engine grows a finer-grained source).
  const byMonth = new Map<string, number>();
  for (const c of validOps(input.claimAggregates)) {
    if (!isLast5DaysOfMonth(c.latest_invoice_date)) continue;
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym) continue;
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
  }
  let occurrences = 0;
  for (const n of byMonth.values()) if (n >= 3) occurrences += 1;
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, RECURRENCE_LIGHTNING),
    progressLabel: `${occurrences} late-month surge(s)`,
    progressData: { occurrences },
  };
}

/**
 * Touched Grass — returned from a full week of zero activity with 3+ ops
 * the following week.
 */
function evaluateTouchedGrass(input: BadgeEvaluatorInput): BadgeEvaluation {
  const sorted = sortByInvoiceAsc(validOps(input.claimAggregates));
  let occurrences = 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    // Look 7 days back from this op; if no other op exists in that window
    // AND the previous activity was >=7 days before this one, AND in the
    // following 7 days the consultant has at least 3 ops, count it.
    const here = c.latest_invoice_date;
    const prev = i > 0 ? sorted[i - 1]!.latest_invoice_date : null;
    const gap = prev ? daysBetween(prev, here) : null;
    if (gap === null || gap < 7) continue;
    // Count ops within the next 7 days inclusive of `here`.
    const endDay = addDays(here, 6);
    let following = 0;
    for (let j = i; j < sorted.length; j++) {
      const d = sorted[j]!.latest_invoice_date;
      if (d > endDay) break;
      following += 1;
    }
    if (following >= 3) occurrences += 1;
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, FIRST_PAST_THE_POST_TIERS),
    progressLabel: `${occurrences} comeback week(s)`,
    progressData: { occurrences },
  };
}
function addDays(iso: string, n: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** The Drought Breaker — first op after a 14+ day dry spell. */
function evaluateTheDroughtBreaker(input: BadgeEvaluatorInput): BadgeEvaluation {
  const sorted = sortByInvoiceAsc(validOps(input.claimAggregates));
  let occurrences = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1]!.latest_invoice_date, sorted[i]!.latest_invoice_date);
    if (gap !== null && gap >= 14) occurrences += 1;
  }
  return {
    currentValue: occurrences,
    earnedTiers: tiersEarned(occurrences, FIRST_PAST_THE_POST_TIERS),
    progressLabel: `${occurrences} dry-spell break(s)`,
    progressData: { occurrences },
  };
}

/**
 * Dream Team — same Lead consultant + Lead expert pairing delivers ≥5 ops
 * together. Tier reads off the max partnership count.
 */
function evaluateDreamTeam(input: BadgeEvaluatorInput): BadgeEvaluation {
  let best = 0;
  let bestPartner: string | null = null;
  for (const [partner, n] of input.partnerOpCounts) {
    if (n > best) {
      best = n;
      bestPartner = partner;
    }
  }
  return {
    currentValue: best,
    earnedTiers: tiersEarned(best, DREAM_TEAM_TIERS),
    progressLabel: `Strongest pairing: ${best} op(s)`,
    progressData: { best, partnerId: bestPartner },
  };
}
const DREAM_TEAM_TIERS = tierTable([
  ["bronze", 5, "5 ops"],
  ["silver", 10, "10 ops"],
  ["gold", 15, "15 ops"],
  ["platinum", 20, "20 ops"],
  ["diamond", 25, "25 ops"],
]);

// ---------- Catalog ---------------------------------------------------

export const BADGE_CATALOG: BadgeDefinition[] = [
  // Volume
  {
    key: "op_machine",
    name: "Op Machine",
    description: "Net-valid ops in a calendar month.",
    role: "both",
    category: "volume",
    icon: "Gauge",
    tiers: OP_MACHINE_TIERS,
    evaluate: evaluateOpMachine,
  },
  {
    key: "bookings_beast",
    name: "Bookings Beast",
    description: "Lifetime net-valid ops.",
    role: "both",
    category: "volume",
    icon: "Boxes",
    tiers: BOOKINGS_BEAST_TIERS,
    evaluate: evaluateBookingsBeast,
  },

  // Fees
  {
    key: "heavyweight",
    name: "Heavyweight",
    description: "Largest single-op net fee.",
    role: "both",
    category: "fees",
    icon: "Dumbbell",
    tiers: HEAVYWEIGHT_TIERS,
    evaluate: evaluateHeavyweight,
  },
  {
    key: "the_whale",
    name: "The Whale",
    description: "Mythic: a single op of £75k or more.",
    role: "both",
    category: "fees",
    icon: "Anchor",
    tiers: MYTHIC(75_000, "£75k single op"),
    evaluate: evaluateTheWhale,
  },
  {
    key: "empire_builder",
    name: "Empire Builder",
    description: "Lifetime net fees.",
    role: "both",
    category: "fees",
    icon: "Crown",
    tiers: EMPIRE_BUILDER_TIERS,
    evaluate: evaluateEmpireBuilder,
  },

  // Speed — technical
  {
    key: "lightning_rod",
    name: "Lightning Rod",
    description: "Handover to tech writeup reviewed in 14 days or less.",
    role: "technical",
    category: "speed",
    icon: "Zap",
    tiers: RECURRENCE_LIGHTNING,
    evaluate: evaluateLightningRod,
  },
  {
    key: "speed_demon",
    name: "Speed Demon",
    description: "Mythic: a sub-7-day tech cycle.",
    role: "technical",
    category: "speed",
    icon: "Flame",
    tiers: MYTHIC(1, "sub-7-day cycle"),
    evaluate: evaluateSpeedDemon,
  },
  {
    key: "express_lane",
    name: "Express Lane",
    description: "Three ops in a row each completed in 21 days or less.",
    role: "technical",
    category: "speed",
    icon: "FastForward",
    tiers: RECURRENCE_LIGHTNING,
    evaluate: evaluateExpressLane,
  },

  // Speed — financial
  {
    key: "number_cruncher_express",
    name: "Number Cruncher Express",
    description: "Handover to cost assessment reviewed in 14 days or less.",
    role: "financial",
    category: "speed",
    icon: "Calculator",
    tiers: RECURRENCE_LIGHTNING,
    evaluate: evaluateNumberCruncherExpress,
  },
  {
    key: "document_sniper",
    name: "Document Sniper",
    description: "Costs received within 7 days of handover.",
    role: "financial",
    category: "speed",
    icon: "Crosshair",
    tiers: DOC_SNIPER_TIERS,
    evaluate: evaluateDocumentSniper,
  },
  {
    key: "paper_trail_pro",
    name: "Paper Trail Pro",
    description: "Mythic: 10 consecutive ops with both fin docs and costs in 14 days.",
    role: "financial",
    category: "speed",
    icon: "FileCheck",
    tiers: MYTHIC(10, "10 in a row"),
    evaluate: evaluatePaperTrailPro,
  },

  // Invoicing
  {
    key: "early_bird",
    name: "Early Bird",
    description: "Invoice raised same day as the relevant review.",
    role: "both",
    category: "invoicing",
    icon: "Sunrise",
    tiers: EARLY_BIRD_TIERS,
    evaluate: evaluateEarlyBird,
  },
  {
    key: "cash_flow_king",
    name: "Cash Flow King",
    description: "Mythic: 3 consecutive months with majority invoiced in first 10 days.",
    role: "both",
    category: "invoicing",
    icon: "Wallet",
    tiers: MYTHIC(3, "3 months in a row"),
    evaluate: evaluateCashFlowKing,
  },

  // Compliance
  {
    key: "prenotification_hawk",
    name: "Pre-Notification Hawk",
    description: "Streak of correctly-submitted pre-notifications when required.",
    role: "both",
    category: "compliance",
    icon: "ShieldCheck",
    tiers: PRE_NOTIF_HAWK_TIERS,
    evaluate: evaluatePreNotificationHawk,
  },
  {
    key: "risk_slayer",
    name: "Risk Slayer",
    description: "Valid pre-notification submitted before the 6-month deadline.",
    role: "both",
    category: "compliance",
    icon: "Swords",
    tiers: RISK_SLAYER_TIERS,
    evaluate: evaluateRiskSlayer,
  },
  {
    key: "zero_slippage",
    name: "Zero Slippage",
    description: "Mythic: 6 consecutive months with zero missed pre-notifications.",
    role: "both",
    category: "compliance",
    icon: "ShieldAlert",
    tiers: MYTHIC(6, "6 clean months"),
    evaluate: evaluateZeroSlippage,
  },

  // Consistency
  {
    key: "iron_streak",
    name: "Iron Streak",
    description: "Consecutive months hitting Op Machine threshold.",
    role: "both",
    category: "consistency",
    icon: "Activity",
    tiers: IRON_STREAK_TIERS,
    evaluate: evaluateIronStreak,
  },
  {
    key: "the_standard",
    name: "The Standard",
    description: "Mythic: 12 consecutive months at threshold.",
    role: "both",
    category: "consistency",
    icon: "Medal",
    tiers: MYTHIC(12, "12 in a row"),
    evaluate: evaluateTheStandard,
  },
  {
    key: "showing_up",
    name: "Showing Up",
    description: "Delivered ops in every week of a calendar month.",
    role: "both",
    category: "consistency",
    icon: "CalendarCheck",
    tiers: SHOWING_UP_TIERS,
    evaluate: evaluateShowingUp,
  },

  // Specialization
  {
    key: "year_end_surgeon",
    name: "Year-End Surgeon",
    description: "5+ ops with the same year-end month within one calendar month.",
    role: "both",
    category: "specialization",
    icon: "Scissors",
    tiers: YEAR_END_SURGEON_TIERS,
    evaluate: evaluateYearEndSurgeon,
  },
  {
    key: "the_specialist",
    name: "The Specialist",
    description: "Lifetime ops on the same product.",
    role: "both",
    category: "specialization",
    icon: "Award",
    tiers: BOOKINGS_BEAST_TIERS,
    evaluate: evaluateTheSpecialist,
  },

  // Quality
  {
    key: "trusted_pair",
    name: "Trusted Pair",
    description: "Tech write-up reviews completed.",
    role: "technical",
    category: "quality",
    icon: "Handshake",
    tiers: REVIEWER_TIERS,
    evaluate: evaluateTrustedPair,
  },
  {
    key: "the_gatekeeper",
    name: "The Gatekeeper",
    description: "Cost assessment reviews completed.",
    role: "financial",
    category: "quality",
    icon: "KeyRound",
    tiers: REVIEWER_TIERS,
    evaluate: evaluateTheGatekeeper,
  },

  // Rare
  {
    key: "the_triple_threat",
    name: "The Triple Threat",
    description: "Mythic: lead consultant, lead expert, and reviewer in the same month.",
    role: "both",
    category: "rare",
    icon: "Trophy",
    tiers: MYTHIC(1, "all three in one month"),
    evaluate: evaluateTripleThreat,
  },
  {
    key: "hat_trick",
    name: "Hat Trick",
    description: "Three ops above £20k net in a single month.",
    role: "both",
    category: "rare",
    icon: "PiggyBank",
    tiers: HAT_TRICK_TIERS,
    evaluate: evaluateHatTrick,
  },
  {
    key: "quadfecta",
    name: "Quadfecta",
    description: "Mythic: ops across 4 different year-end months in one calendar month.",
    role: "both",
    category: "rare",
    icon: "Layers",
    tiers: MYTHIC(1, "4 year-ends in 1 month"),
    evaluate: evaluateQuadfecta,
  },
  {
    key: "comeback_kid",
    name: "Comeback Kid",
    description: "Hit monthly threshold after a sub-threshold previous month.",
    role: "both",
    category: "rare",
    icon: "Undo2",
    tiers: COMEBACK_KID_TIERS,
    evaluate: evaluateComebackKid,
  },
  {
    key: "built_different",
    name: "Built Different",
    description: "Top of monthly leaderboard with a 30%+ lead over second place.",
    role: "both",
    category: "rare",
    icon: "Star",
    tiers: BUILT_DIFFERENT_TIERS,
    evaluate: evaluateBuiltDifferent,
  },

  // Personality
  {
    key: "no_days_off",
    name: "No Days Off",
    description: "Ops delivered on 3+ consecutive calendar days.",
    role: "both",
    category: "personality",
    icon: "TrendingUp",
    tiers: COMEBACK_KID_TIERS,
    evaluate: evaluateNoDaysOff,
  },
  {
    key: "first_past_the_post",
    name: "First Past the Post",
    description: "First op of the month, three months running.",
    role: "both",
    category: "personality",
    icon: "Flag",
    tiers: FIRST_PAST_THE_POST_TIERS,
    evaluate: evaluateFirstPastThePost,
  },
  {
    key: "the_closer",
    name: "The Closer",
    description: "Heavy delivery in the last 5 days of a month.",
    role: "both",
    category: "personality",
    icon: "Hourglass",
    tiers: RECURRENCE_LIGHTNING,
    evaluate: evaluateTheCloser,
  },
  {
    key: "touched_grass",
    name: "Touched Grass",
    description: "Returned from a quiet week with 3+ ops the following week.",
    role: "both",
    category: "personality",
    icon: "Leaf",
    tiers: FIRST_PAST_THE_POST_TIERS,
    evaluate: evaluateTouchedGrass,
  },
  {
    key: "the_drought_breaker",
    name: "The Drought Breaker",
    description: "First op after a 14+ day dry spell.",
    role: "both",
    category: "personality",
    icon: "Droplets",
    tiers: FIRST_PAST_THE_POST_TIERS,
    evaluate: evaluateTheDroughtBreaker,
  },

  // Team
  {
    key: "dream_team",
    name: "Dream Team",
    description: "Same lead consultant + lead expert pairing delivers 5+ ops.",
    role: "both",
    category: "team",
    icon: "Users",
    tiers: DREAM_TEAM_TIERS,
    evaluate: evaluateDreamTeam,
  },
];

export const BADGE_BY_KEY: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_CATALOG.map((b) => [b.key, b]),
);
