import type { SupabaseClient } from "@supabase/supabase-js";
import { daysBetween } from "@/lib/badges/helpers";
import type { ClaimAggregate } from "@/lib/types/domain";
import type { Role } from "@/lib/types";

/**
 * The list of records the engine tracks. Adding a new record means appending
 * here and adding a producer function below.
 */
export const RECORD_KEYS = {
  mostOpsMonthTechnical: "most_ops_month_technical",
  mostOpsMonthFinancial: "most_ops_month_financial",
  fastestTechCycle: "fastest_tech_cycle",
  fastestFinancialCycle: "fastest_financial_cycle",
  fastestDocsReceived: "fastest_docs_received",
  largestSingleFee: "largest_single_fee",
  longestIronStreak: "longest_iron_streak",
  mostOpsLifetimeTechnical: "most_ops_lifetime_technical",
  mostOpsLifetimeFinancial: "most_ops_lifetime_financial",
} as const;

interface RecordCandidate {
  record_key: string;
  role: Role;
  holder_id: string;
  holder_display_name: string;
  value: number;
  value_label: string;
  achieved_at: string; // ISO date
  context: Record<string, unknown>;
}

/**
 * Recompute every record from current data. Compares to existing
 * `is_current = true` rows; when the holder or value differs, the old row is
 * flipped to `is_current = false` and a fresh row inserted with `set_at =
 * now()`. This preserves a full history of who held each record when.
 *
 * Returns the number of records that changed hands (or value) in this run.
 */
export async function recomputeRecords(
  supabase: SupabaseClient,
): Promise<{ changed: number; checked: number }> {
  // Pull the data we need.
  const { data: aggsRaw, error: aggsErr } = await supabase
    .from("claim_aggregates")
    .select("*")
    .eq("is_valid_op", true);
  if (aggsErr) throw new Error(`failed to load claim_aggregates: ${aggsErr.message}`);
  const aggs: ClaimAggregate[] = (aggsRaw ?? []).map((r) => ({
    ...(r as ClaimAggregate),
    net_amount: Number(r.net_amount),
    claim_year: null,
  }));

  const { data: snaps, error: snapsErr } = await supabase
    .from("monthly_snapshots")
    .select("consultant_id, role, year_month, ops_count, net_fees");
  if (snapsErr) throw new Error(`failed to load monthly_snapshots: ${snapsErr.message}`);

  const { data: streaks, error: streaksErr } = await supabase
    .from("streaks")
    .select("consultant_id, role, streak_type, best_count, last_extended_at")
    .eq("streak_type", "iron_streak");
  if (streaksErr) throw new Error(`failed to load streaks: ${streaksErr.message}`);

  // Resolve display names in one trip.
  const consultantIds = new Set<string>();
  for (const a of aggs) {
    if (a.lead_consultant_id) consultantIds.add(a.lead_consultant_id);
    if (a.lead_expert_id) consultantIds.add(a.lead_expert_id);
  }
  for (const s of snaps ?? []) consultantIds.add(s.consultant_id);
  for (const s of streaks ?? []) consultantIds.add(s.consultant_id);
  const displayNames = new Map<string, string>();
  if (consultantIds.size > 0) {
    const { data: people, error: pErr } = await supabase
      .from("consultants")
      .select("id, display_name")
      .in("id", [...consultantIds]);
    if (pErr) throw new Error(`failed to load consultants: ${pErr.message}`);
    for (const p of people ?? []) displayNames.set(p.id, p.display_name);
  }
  const name = (id: string | null) => (id ? (displayNames.get(id) ?? "Unknown") : "Unknown");

  const candidates: RecordCandidate[] = [];

  // most_ops_month_{role} — largest single month's ops_count
  for (const role of ["technical", "financial"] as Role[]) {
    let best: { id: string; ym: string; ops: number; fees: number } | null = null;
    for (const s of (snaps ?? []).filter((s) => s.role === role)) {
      if (!best || s.ops_count > best.ops || (s.ops_count === best.ops && s.net_fees > best.fees)) {
        best = {
          id: s.consultant_id,
          ym: s.year_month,
          ops: s.ops_count,
          fees: Number(s.net_fees),
        };
      }
    }
    if (best) {
      candidates.push({
        record_key:
          role === "technical"
            ? RECORD_KEYS.mostOpsMonthTechnical
            : RECORD_KEYS.mostOpsMonthFinancial,
        role,
        holder_id: best.id,
        holder_display_name: name(best.id),
        value: best.ops,
        value_label: `${best.ops} ops (${best.ym})`,
        achieved_at: `${best.ym}-01`,
        context: { year_month: best.ym, net_fees: best.fees },
      });
    }
  }

  // fastest_tech_cycle
  pushFastestCycle(
    candidates,
    aggs,
    "technical",
    RECORD_KEYS.fastestTechCycle,
    (c) => daysBetween(c.handover_complete_date, c.tech_writeup_reviewed_date),
    (c) => c.lead_consultant_id,
    name,
  );

  // fastest_financial_cycle
  pushFastestCycle(
    candidates,
    aggs,
    "financial",
    RECORD_KEYS.fastestFinancialCycle,
    (c) => daysBetween(c.handover_complete_date, c.cost_assessment_reviewed_date),
    (c) => c.lead_expert_id,
    name,
  );

  // fastest_docs_received — attributed to the financial owner.
  pushFastestCycle(
    candidates,
    aggs,
    "financial",
    RECORD_KEYS.fastestDocsReceived,
    (c) => daysBetween(c.handover_complete_date, c.costs_received_date),
    (c) => c.lead_expert_id,
    name,
  );

  // largest_single_fee — attributed to the technical lead (the consultant
  // who owns the claim end-to-end). Could be split per role, but ops are
  // normally owned by both lead consultant and lead expert; we attribute to
  // technical here as the canonical "ownership" side per the brief's
  // framing of the leaderboard pair.
  {
    let best: ClaimAggregate | null = null;
    for (const c of aggs) {
      if (!best || c.net_amount > best.net_amount) best = c;
    }
    if (best && best.lead_consultant_id) {
      candidates.push({
        record_key: RECORD_KEYS.largestSingleFee,
        role: "technical",
        holder_id: best.lead_consultant_id,
        holder_display_name: name(best.lead_consultant_id),
        value: best.net_amount,
        value_label: `£${best.net_amount.toLocaleString()}`,
        achieved_at: best.latest_invoice_date,
        context: { claim_reference: best.claim_reference },
      });
    }
  }

  // longest_iron_streak — biggest best_count across all iron_streak rows.
  for (const role of ["technical", "financial"] as Role[]) {
    let best: { id: string; n: number; date: string | null } | null = null;
    for (const s of (streaks ?? []).filter((s) => s.role === role)) {
      if (!best || s.best_count > best.n) {
        best = { id: s.consultant_id, n: s.best_count, date: s.last_extended_at };
      }
    }
    if (best && best.n > 0) {
      candidates.push({
        record_key: RECORD_KEYS.longestIronStreak,
        role,
        holder_id: best.id,
        holder_display_name: name(best.id),
        value: best.n,
        value_label: `${best.n} month${best.n === 1 ? "" : "s"}`,
        achieved_at: best.date ?? new Date().toISOString().slice(0, 10),
        context: {},
      });
    }
  }

  // most_ops_lifetime — count of valid ops per consultant per role across
  // all time. Computed from claim_aggregates.
  for (const role of ["technical", "financial"] as Role[]) {
    const counts = new Map<string, number>();
    for (const c of aggs) {
      const owner = role === "technical" ? c.lead_consultant_id : c.lead_expert_id;
      if (!owner) continue;
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    let bestId: string | null = null;
    let bestN = 0;
    for (const [id, n] of counts) {
      if (n > bestN) {
        bestN = n;
        bestId = id;
      }
    }
    if (bestId) {
      candidates.push({
        record_key:
          role === "technical"
            ? RECORD_KEYS.mostOpsLifetimeTechnical
            : RECORD_KEYS.mostOpsLifetimeFinancial,
        role,
        holder_id: bestId,
        holder_display_name: name(bestId),
        value: bestN,
        value_label: `${bestN} ops`,
        achieved_at: new Date().toISOString().slice(0, 10),
        context: {},
      });
    }
  }

  // Reconcile against existing current records.
  const { data: current, error: curErr } = await supabase
    .from("records")
    .select("id, record_key, role, holder_id, value")
    .eq("is_current", true);
  if (curErr) throw new Error(`failed to load records: ${curErr.message}`);
  const currentByKey = new Map<string, (typeof current)[number]>();
  for (const r of current ?? []) currentByKey.set(`${r.record_key}|${r.role}`, r);

  let changed = 0;
  for (const cand of candidates) {
    const key = `${cand.record_key}|${cand.role}`;
    const existing = currentByKey.get(key);
    const sameHolder = existing?.holder_id === cand.holder_id;
    const sameValue =
      existing !== undefined && Math.abs(Number(existing.value) - cand.value) < 0.001;
    if (existing && sameHolder && sameValue) continue;

    if (existing) {
      const { error: flipErr } = await supabase
        .from("records")
        .update({ is_current: false })
        .eq("id", existing.id);
      if (flipErr) throw new Error(`failed to flip record: ${flipErr.message}`);
    }
    const { error: insErr } = await supabase.from("records").insert({
      record_key: cand.record_key,
      role: cand.role,
      holder_id: cand.holder_id,
      holder_display_name: cand.holder_display_name,
      value: cand.value,
      value_label: cand.value_label,
      achieved_at: cand.achieved_at,
      context: cand.context,
      is_current: true,
    });
    if (insErr) throw new Error(`failed to insert record: ${insErr.message}`);
    changed += 1;
  }
  return { changed, checked: candidates.length };
}

function pushFastestCycle(
  out: RecordCandidate[],
  aggs: ClaimAggregate[],
  role: Role,
  key: string,
  measure: (c: ClaimAggregate) => number | null,
  owner: (c: ClaimAggregate) => string | null,
  name: (id: string | null) => string,
): void {
  let best: { claim: ClaimAggregate; n: number } | null = null;
  for (const c of aggs) {
    const days = measure(c);
    if (days === null || days < 0) continue;
    if (!best || days < best.n) best = { claim: c, n: days };
  }
  if (!best) return;
  const ownerId = owner(best.claim);
  if (!ownerId) return;
  out.push({
    record_key: key,
    role,
    holder_id: ownerId,
    holder_display_name: name(ownerId),
    value: best.n,
    value_label: `${best.n} day${best.n === 1 ? "" : "s"}`,
    achieved_at: best.claim.latest_invoice_date,
    context: { claim_reference: best.claim.claim_reference },
  });
}
