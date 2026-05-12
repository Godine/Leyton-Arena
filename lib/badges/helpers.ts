import type { BadgeTier } from "@/lib/types";
import type { ClaimAggregate } from "@/lib/types/domain";

/** All tiers in ascending order. */
export const TIER_ORDER: BadgeTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "mythic",
];

/**
 * Given a numeric value and the catalog tiers (already in catalog order), pick
 * every tier whose threshold has been met. The catalog stores tiers in
 * ascending threshold order; we walk and collect until we hit one we don't
 * qualify for.
 */
export function tiersEarned(
  value: number,
  tiers: Array<{ tier: BadgeTier; threshold: number }>,
): BadgeTier[] {
  const earned: BadgeTier[] = [];
  for (const t of tiers) {
    if (value >= t.threshold) earned.push(t.tier);
    else break;
  }
  return earned;
}

/** Year-month key, "YYYY-MM", from any ISO date string. */
export function yearMonthOf(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  return isoDate.slice(0, 7);
}

/** Day delta (b - a) in whole days. Both must be ISO YYYY-MM-DD strings. */
export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((db - da) / (24 * 60 * 60 * 1000));
}

/** All ISO month names → 0-indexed month. */
const MONTH_BY_NAME: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/** Month index (0-indexed) for a month name. */
export function monthIndex(monthName: string | null | undefined): number | null {
  if (!monthName) return null;
  const idx = MONTH_BY_NAME[monthName.trim().toLowerCase()];
  return idx === undefined ? null : idx;
}

/**
 * Extract the claim year from the reference suffix. Claim refs look like
 *
 *   "RDTC UK - Sensio Limited - 2024"
 *
 * so we grab the trailing 4-digit year. Returns null if the reference doesn't
 * follow the pattern.
 */
export function extractClaimYear(claimReference: string): number | null {
  const m = claimReference.match(/-\s*(\d{4})\s*$/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
}

/**
 * The HMRC pre-notification deadline for a claim. The deadline is exactly six
 * months before the claim's year-end date (the last day of `year_end_month`
 * in `claim_year`). We use the *start* of the deadline month for the cutoff —
 * a pre-notification submitted on or before this date is on time.
 *
 * Example: year_end_month = "December", claim_year = 2024 → deadline = June 30
 * 2024 (6 months before Dec 31 2024). For "March" + 2025 → deadline = Sep 30
 * 2024.
 *
 * Returns the deadline as an ISO YYYY-MM-DD string, or null if either field
 * is missing or unparseable.
 */
export function preNotificationDeadline(claim: ClaimAggregate): string | null {
  if (claim.claim_year == null) return null;
  const idx = monthIndex(claim.year_end_month);
  if (idx == null) return null;
  // Last day of (claim_year, idx). Use day=0 of the following month.
  const yearEnd = new Date(Date.UTC(claim.claim_year, idx + 1, 0));
  // Six calendar months earlier, same day-of-month (handled by Date math).
  const deadline = new Date(yearEnd);
  deadline.setUTCMonth(deadline.getUTCMonth() - 6);
  return deadline.toISOString().slice(0, 10);
}

/** Sort claims by latest_invoice_date ascending. */
export function sortByInvoiceAsc<T extends { latest_invoice_date: string }>(claims: T[]): T[] {
  return [...claims].sort((a, b) =>
    a.latest_invoice_date < b.latest_invoice_date
      ? -1
      : a.latest_invoice_date > b.latest_invoice_date
        ? 1
        : 0,
  );
}

/** Count of distinct calendar-week buckets touched in a given year-month. */
export function weeksTouched(dates: string[], yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return 0;
  // Use ISO week number for stable bucketing. For a 28–31 day month, ISO weeks
  // produce 4 or 5 distinct buckets, which is what we want for Showing Up.
  const weeks = new Set<string>();
  for (const d of dates) {
    if (d.slice(0, 7) !== yearMonth) continue;
    const dt = new Date(`${d}T00:00:00Z`);
    // ISO week number per https://en.wikipedia.org/wiki/ISO_week_date.
    const dayNr = (dt.getUTCDay() + 6) % 7;
    const target = new Date(dt);
    target.setUTCDate(dt.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const weekNo =
      1 +
      Math.round(
        ((target.getTime() - firstThursday.getTime()) / 86400000 -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7,
      );
    weeks.add(`${target.getUTCFullYear()}-${weekNo}`);
  }
  return weeks.size;
}

/**
 * Iterate consecutive calendar months between two ISO dates inclusive, by
 * year-month string. Useful for building "consecutive months" iterations
 * where months with zero data must still be counted as a gap.
 */
export function monthsBetween(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO) return [];
  const out: string[] = [];
  const [sy, sm] = startISO.slice(0, 7).split("-").map(Number);
  const [ey, em] = endISO.slice(0, 7).split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Whether a date is in the last 5 days of its calendar month. */
export function isLast5DaysOfMonth(isoDate: string): boolean {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  const next = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
  const lastDay = new Date(next.getTime() - 86400000).getUTCDate();
  return dt.getUTCDate() > lastDay - 5;
}

/** Day-of-month from an ISO date string. */
export function dayOfMonth(isoDate: string): number {
  return Number(isoDate.slice(8, 10));
}
