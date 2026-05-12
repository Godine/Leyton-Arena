/**
 * In-memory simulation of the Part 2 pipeline against the bundled sample
 * Excel file. Mirrors what the API would do — parse, net, snapshot, streak,
 * badge — without touching Supabase. Useful for verifying acceptance
 * criteria before any DB infra is set up.
 *
 *   npx tsx scripts/smoke-recompute.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseInvoiceExport } from "../lib/parsers/excel";
import { normalizeName } from "../lib/parsers/normalize";
import { BADGE_CATALOG } from "../lib/badges/catalog";
import { extractClaimYear } from "../lib/badges/helpers";
import { computeStreaks, ironStreakThresholdFromBadges } from "../lib/computations/streaks";
import type { ClaimAggregate, MonthlySnapshotLite } from "../lib/types/domain";
import type { Role, BadgeTier } from "../lib/types";

const samplePath = path.join(
  process.cwd(),
  "FX invoices Report (account.invoice.fx.report) (29).xlsx",
);
const buf = fs.readFileSync(samplePath);
const result = parseInvoiceExport(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
);
console.log(`Parsed ${result.rows.length} rows, ${result.errors.length} errors\n`);

// Synthesise consultant ids (uuid-like) from normalized names — keeps the
// pipeline deterministic for this run.
const idByNorm = new Map<string, string>();
const displayByNorm = new Map<string, string>();
const role: Map<string, { tech: boolean; fin: boolean }> = new Map();
const consultantId = (name: string | null, asRole: "technical" | "financial"): string | null => {
  if (!name) return null;
  const norm = normalizeName(name);
  if (!norm) return null;
  let id = idByNorm.get(norm);
  if (!id) {
    id = `c_${idByNorm.size + 1}`;
    idByNorm.set(norm, id);
    displayByNorm.set(norm, name.trim());
    role.set(id, { tech: false, fin: false });
  }
  const r = role.get(id)!;
  if (asRole === "technical") r.tech = true;
  else r.fin = true;
  return id;
};
for (const r of result.rows) {
  consultantId(r.lead_consultant_name, "technical");
  consultantId(r.lead_expert_name, "financial");
  consultantId(r.tech_writeup_reviewer_name, "technical");
  consultantId(r.cost_assessment_reviewer_name, "financial");
}

// Build claim_aggregates by netting per the same rules as lib/computations/netting.ts.
type Aggregate = ClaimAggregate;
const byClaim = new Map<string, typeof result.rows>();
for (const r of result.rows) {
  const arr = byClaim.get(r.claim_reference) ?? [];
  arr.push(r);
  byClaim.set(r.claim_reference, arr);
}

function pickLatestVal<T>(
  rows: ReadonlyArray<{ invoice_date: string | null }>,
  field: string,
): T | null {
  const sorted = [...rows].sort((a, b) =>
    (a.invoice_date ?? "") < (b.invoice_date ?? "") ? 1 : -1,
  );
  for (const r of sorted) {
    const v = (r as Record<string, unknown>)[field];
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return null;
}

const aggregates: Aggregate[] = [];
for (const [ref, rows] of byClaim) {
  const net = Math.round(rows.reduce((s, r) => s + (r.amount_due_excl_tax ?? 0), 0) * 100) / 100;
  const latest = rows.slice().sort((a, b) => (a.invoice_date! < b.invoice_date! ? 1 : -1))[0]!;
  if (!latest.invoice_date) continue;
  aggregates.push({
    claim_reference: ref,
    net_amount: net,
    latest_invoice_date: latest.invoice_date,
    is_valid_op: net > 0,
    row_count: rows.length,
    lead_consultant_id: consultantId(latest.lead_consultant_name, "technical"),
    lead_expert_id: consultantId(latest.lead_expert_name, "financial"),
    client_display_name: pickLatestVal<string>(rows, "client_display_name"),
    product: pickLatestVal<string>(rows, "product"),
    year_end_month: pickLatestVal<string>(rows, "year_end_month"),
    handover_complete_date: pickLatestVal<string>(rows, "handover_complete_date"),
    overview_complete_date: pickLatestVal<string>(rows, "overview_complete_date"),
    scoping_complete_date: pickLatestVal<string>(rows, "scoping_complete_date"),
    tech_writeup_reviewed_date: pickLatestVal<string>(rows, "tech_writeup_reviewed_date"),
    cost_assessment_reviewed_date: pickLatestVal<string>(rows, "cost_assessment_reviewed_date"),
    financial_documents_received_date: pickLatestVal<string>(
      rows,
      "financial_documents_received_date",
    ),
    costs_received_date: pickLatestVal<string>(rows, "costs_received_date"),
    pre_notification_required: pickLatestVal<boolean>(rows, "pre_notification_required"),
    pre_notification_date: pickLatestVal<string>(rows, "pre_notification_date"),
    tech_writeup_reviewer_id: consultantId(
      pickLatestVal<string>(rows, "tech_writeup_reviewer_name"),
      "technical",
    ),
    cost_assessment_reviewer_id: consultantId(
      pickLatestVal<string>(rows, "cost_assessment_reviewer_name"),
      "financial",
    ),
    claim_year: extractClaimYear(ref),
  });
}

const validAggs = aggregates.filter((a) => a.is_valid_op);
console.log(`Aggregates: ${aggregates.length} (valid ${validAggs.length})`);

// Snapshots.
const snapshots: MonthlySnapshotLite[] = [];
const buckets = new Map<
  string,
  { id: string; role: Role; ym: string; ops: number; fees: number }
>();
for (const c of validAggs) {
  const ym = c.latest_invoice_date.slice(0, 7);
  for (const [r, ownerId] of [
    ["technical", c.lead_consultant_id],
    ["financial", c.lead_expert_id],
  ] as const) {
    if (!ownerId) continue;
    const k = `${ownerId}|${r}|${ym}`;
    const b = buckets.get(k) ?? { id: ownerId, role: r, ym, ops: 0, fees: 0 };
    b.ops += 1;
    b.fees += c.net_amount;
    buckets.set(k, b);
  }
}
const groups = new Map<string, typeof snapshots>();
for (const b of buckets.values()) {
  const s: MonthlySnapshotLite = {
    consultant_id: b.id,
    role: b.role,
    year_month: b.ym,
    ops_count: b.ops,
    net_fees: Math.round(b.fees * 100) / 100,
    avg_cycle_days: null,
    rank: null,
    total_consultants: null,
  };
  const gk = `${b.role}|${b.ym}`;
  const arr = groups.get(gk) ?? [];
  arr.push(s);
  groups.set(gk, arr);
}
for (const arr of groups.values()) {
  arr.sort((a, b) => b.ops_count - a.ops_count || b.net_fees - a.net_fees);
  arr.forEach((s, i) => {
    s.rank = i + 1;
    s.total_consultants = arr.length;
    snapshots.push(s);
  });
}

console.log(`Monthly snapshots: ${snapshots.length}`);
const topTech = snapshots
  .filter((s) => s.role === "technical")
  .sort((a, b) => b.ops_count - a.ops_count)
  .slice(0, 3);
const topFin = snapshots
  .filter((s) => s.role === "financial")
  .sort((a, b) => b.ops_count - a.ops_count)
  .slice(0, 3);
console.log(
  "Top technical:",
  topTech.map((s) => `${displayName(s.consultant_id)} ${s.ops_count}@${s.year_month}`),
);
console.log(
  "Top financial:",
  topFin.map((s) => `${displayName(s.consultant_id)} ${s.ops_count}@${s.year_month}`),
);

// Streaks (without prior op-machine badges -> bronze threshold).
const allIds = [...role.keys()];
const streaksAll: { id: string; role: Role; type: string; current: number; best: number }[] = [];
for (const id of allIds) {
  for (const r of ["technical", "financial"] as Role[]) {
    const ownerClaims = aggregates.filter(
      (c) => (r === "technical" ? c.lead_consultant_id : c.lead_expert_id) === id,
    );
    if (ownerClaims.length === 0) continue;
    const threshold = ironStreakThresholdFromBadges([], r);
    const out = computeStreaks(ownerClaims, r, threshold, new Date("2026-05-12"));
    for (const s of out) {
      streaksAll.push({
        id,
        role: r,
        type: s.streak_type,
        current: s.current_count,
        best: s.best_count,
      });
    }
  }
}
const activeStreaks = streaksAll.filter((s) => s.best > 0);
console.log(`Streaks with best>0: ${activeStreaks.length}`);
activeStreaks
  .slice(0, 6)
  .forEach((s) =>
    console.log(
      `  ${displayName(s.id)} [${s.role}] ${s.type}: current=${s.current} best=${s.best}`,
    ),
  );

// Badges. Walk catalog per consultant per role.
const partnerByConsultant = new Map<string, Map<string, number>>();
for (const c of validAggs) {
  if (!c.lead_consultant_id || !c.lead_expert_id) continue;
  for (const [a, b] of [
    [c.lead_consultant_id, c.lead_expert_id],
    [c.lead_expert_id, c.lead_consultant_id],
  ]) {
    const inner = partnerByConsultant.get(a!) ?? new Map<string, number>();
    inner.set(b!, (inner.get(b!) ?? 0) + 1);
    partnerByConsultant.set(a!, inner);
  }
}
const reviewerStats = new Map<string, { tech: number; cost: number }>();
for (const id of allIds) reviewerStats.set(id, { tech: 0, cost: 0 });
for (const c of validAggs) {
  if (c.tech_writeup_reviewer_id) reviewerStats.get(c.tech_writeup_reviewer_id)!.tech += 1;
  if (c.cost_assessment_reviewer_id) reviewerStats.get(c.cost_assessment_reviewer_id)!.cost += 1;
}

let earned = 0;
const earnedRows: { name: string; badge: string; role: Role; tier: BadgeTier; label: string }[] =
  [];
for (const id of allIds) {
  for (const r of ["technical", "financial"] as Role[]) {
    const ownerClaims = aggregates.filter(
      (c) => (r === "technical" ? c.lead_consultant_id : c.lead_expert_id) === id,
    );
    const rstats = reviewerStats.get(id)!;
    if (ownerClaims.length === 0 && rstats.tech === 0 && rstats.cost === 0) continue;
    for (const badge of BADGE_CATALOG) {
      if (badge.role !== "both" && badge.role !== r) continue;
      const ev = badge.evaluate({
        consultantId: id,
        role: r,
        asOfDate: new Date("2026-05-12"),
        claimAggregates: ownerClaims,
        allConsultants: allIds.map((id) => ({
          id,
          display_name: displayName(id),
          has_technical_data: role.get(id)?.tech ?? false,
          has_financial_data: role.get(id)?.fin ?? false,
        })),
        monthlySnapshots: snapshots.filter((s) => s.consultant_id === id && s.role === r),
        leaderboardSnapshots: snapshots,
        streaks: streaksAll
          .filter((s) => s.id === id && s.role === r)
          .map((s) => ({
            consultant_id: s.id,
            role: s.role,
            streak_type: s.type,
            current_count: s.current,
            best_count: s.best,
            started_at: null,
            last_extended_at: null,
            is_active: false,
          })),
        reviewerStats: { techWriteupCount: rstats.tech, costAssessmentCount: rstats.cost },
        partnerOpCounts: partnerByConsultant.get(id) ?? new Map(),
      });
      for (const tier of ev.earnedTiers) {
        earned += 1;
        earnedRows.push({
          name: displayName(id),
          badge: badge.key,
          role: r,
          tier,
          label: ev.progressLabel,
        });
      }
    }
  }
}

console.log(`\nBadges earned (across all consultants, all roles): ${earned}`);
// Group for readability.
const byBadge = new Map<string, typeof earnedRows>();
for (const e of earnedRows) {
  const k = `${e.badge}/${e.role}`;
  const arr = byBadge.get(k) ?? [];
  arr.push(e);
  byBadge.set(k, arr);
}
for (const [k, arr] of [...byBadge.entries()].sort()) {
  const tiers = arr.map((e) => `${e.name}=${e.tier}`).join(", ");
  console.log(`  ${k}: ${arr.length} earner(s) — ${tiers}`);
}

function displayName(id: string): string {
  for (const [norm, _id] of idByNorm) if (_id === id) return displayByNorm.get(norm)!;
  return id;
}
