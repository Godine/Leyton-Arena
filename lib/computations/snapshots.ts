import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween, yearMonthOf } from "@/lib/badges/helpers";
import type { ClaimAggregate, MonthlySnapshotLite } from "@/lib/types/domain";
import type { Role } from "@/lib/types";

/**
 * Recompute per-consultant, per-role, per-month aggregates for the listed
 * year-months. Reads from `claim_aggregates`, writes to `monthly_snapshots`.
 * Pure with respect to the DB: every snapshot for the affected months is
 * recomputed from scratch, so running twice is a no-op.
 */
export async function recomputeMonthlySnapshots(
  supabase: SupabaseClient,
  yearMonths: string[],
): Promise<{ upserted: number; deleted: number }> {
  const months = [...new Set(yearMonths.filter(Boolean))];
  if (months.length === 0) return { upserted: 0, deleted: 0 };

  // Fetch every valid claim aggregate landing in the affected months. The
  // `latest_invoice_date` column is a real date, so we can compare against
  // YYYY-MM-01 .. YYYY-MM-{lastday} via a sorted range filter.
  const earliest = `${months.slice().sort()[0]}-01`;
  const latestYM = months.slice().sort().pop()!;
  const [ly, lm] = latestYM.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ly!, lm!, 0)).getUTCDate();
  const latestISO = `${latestYM}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("claim_aggregates")
    .select("*")
    .eq("is_valid_op", true)
    .gte("latest_invoice_date", earliest)
    .lte("latest_invoice_date", latestISO);
  if (error) throw new Error(`failed to load claim_aggregates: ${error.message}`);

  type Bucket = {
    consultant_id: string;
    role: Role;
    year_month: string;
    ops_count: number;
    net_fees: number;
    cycleDaySum: number;
    cycleDayN: number;
  };
  const buckets = new Map<string, Bucket>();
  const targetSet = new Set(months);

  for (const raw of (data ?? []) as ClaimAggregate[]) {
    const c: ClaimAggregate = { ...raw, net_amount: Number(raw.net_amount) };
    const ym = yearMonthOf(c.latest_invoice_date);
    if (!ym || !targetSet.has(ym)) continue;
    for (const [role, ownerId, cycleEnd] of [
      ["technical", c.lead_consultant_id, c.tech_writeup_reviewed_date],
      ["financial", c.lead_expert_id, c.cost_assessment_reviewed_date],
    ] as const) {
      if (!ownerId) continue;
      const key = `${ownerId}|${role}|${ym}`;
      const b = buckets.get(key) ?? {
        consultant_id: ownerId,
        role,
        year_month: ym,
        ops_count: 0,
        net_fees: 0,
        cycleDaySum: 0,
        cycleDayN: 0,
      };
      b.ops_count += 1;
      b.net_fees += c.net_amount;
      const days = daysBetween(c.handover_complete_date, cycleEnd);
      if (days !== null && days >= 0) {
        b.cycleDaySum += days;
        b.cycleDayN += 1;
      }
      buckets.set(key, b);
    }
  }

  // Rank within (role, year_month) by ops_count desc, net_fees desc.
  type Snap = MonthlySnapshotLite;
  const snapsByGroup = new Map<string, Snap[]>();
  for (const b of buckets.values()) {
    const groupKey = `${b.role}|${b.year_month}`;
    const arr = snapsByGroup.get(groupKey) ?? [];
    arr.push({
      consultant_id: b.consultant_id,
      role: b.role,
      year_month: b.year_month,
      ops_count: b.ops_count,
      net_fees: Math.round(b.net_fees * 100) / 100,
      avg_cycle_days: b.cycleDayN > 0 ? Math.round((b.cycleDaySum / b.cycleDayN) * 10) / 10 : null,
      rank: null,
      total_consultants: null,
    });
    snapsByGroup.set(groupKey, arr);
  }
  for (const arr of snapsByGroup.values()) {
    arr.sort((a, b) => b.ops_count - a.ops_count || b.net_fees - a.net_fees);
    arr.forEach((snap, i) => {
      snap.rank = i + 1;
      snap.total_consultants = arr.length;
    });
  }

  const snaps: Snap[] = [];
  for (const arr of snapsByGroup.values()) snaps.push(...arr);

  // Delete any existing snapshots for the affected (role, year_month) keys
  // that no longer have a corresponding bucket — handles the case where a
  // rollback removes every op a consultant had in a given month.
  const monthsToReset = months;
  if (monthsToReset.length > 0) {
    const { error: delErr } = await supabase
      .from("monthly_snapshots")
      .delete()
      .in("year_month", monthsToReset);
    if (delErr) throw new Error(`failed to clear monthly_snapshots: ${delErr.message}`);
  }

  if (snaps.length === 0) {
    return { upserted: 0, deleted: monthsToReset.length };
  }

  let upserted = 0;
  for (let i = 0; i < snaps.length; i += 200) {
    const chunk = snaps.slice(i, i + 200).map((s) => ({
      consultant_id: s.consultant_id,
      role: s.role,
      year_month: s.year_month,
      ops_count: s.ops_count,
      net_fees: s.net_fees,
      avg_cycle_days: s.avg_cycle_days,
      rank: s.rank,
      total_consultants: s.total_consultants,
      computed_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("monthly_snapshots")
      .upsert(chunk, { onConflict: "consultant_id,role,year_month" });
    if (error) throw new Error(`failed to upsert monthly_snapshots: ${error.message}`);
    upserted += chunk.length;
  }
  return { upserted, deleted: 0 };
}
