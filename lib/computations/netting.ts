import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "@/lib/parsers/normalize";
import type { InvoiceRowRow } from "@/lib/supabase/database.types";

/**
 * For each claim reference passed in:
 *   1. Load every `invoice_rows` row for the claim (across all uploads).
 *   2. Sum `amount_due_excl_tax` — this is the net amount. Credit notes have
 *      their reversed line at zero so this captures both clean cancellations
 *      and partial reversals correctly.
 *   3. Take the latest `invoice_date` as the delivery date.
 *   4. Pick workflow dates from the row with the latest `invoice_date`,
 *      falling back to the most recent non-null value across all rows for
 *      that field when the latest row's value is null.
 *   5. Resolve lead consultant/expert ids by `normalized_name`.
 *   6. Upsert into `claim_aggregates`. `is_valid_op = (net_amount > 0)`.
 *
 * Idempotent: calling twice with the same claim refs and the same underlying
 * rows produces the same `claim_aggregates` rows.
 *
 * If a claim reference has zero invoice_rows, the corresponding aggregate is
 * DELETED — this is the rollback path, where rows have already been removed.
 */
export async function recomputeClaimAggregates(
  supabase: SupabaseClient,
  claimReferences: string[],
): Promise<{ upsertedCount: number; deletedCount: number }> {
  const refs = [...new Set(claimReferences.filter((r) => r && r.length > 0))];
  if (refs.length === 0) return { upsertedCount: 0, deletedCount: 0 };

  // Load all invoice rows for these claims in chunks. Supabase has a default
  // `in` filter limit, so we batch.
  const CHUNK = 200;
  const allRows: InvoiceRowRow[] = [];
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("invoice_rows")
      .select("*")
      .in("claim_reference", chunk);
    if (error) throw new Error(`failed to load invoice_rows: ${error.message}`);
    if (data) allRows.push(...(data as InvoiceRowRow[]));
  }

  // Resolve consultant ids by normalized_name for everyone referenced in the
  // loaded rows. We only need lead consultant + lead expert here.
  const norms = new Set<string>();
  for (const r of allRows) {
    const lc = normalizeName(r.lead_consultant_name);
    if (lc) norms.add(lc);
    const le = normalizeName(r.lead_expert_name);
    if (le) norms.add(le);
  }
  const consultantByNorm = new Map<string, string>();
  if (norms.size > 0) {
    const { data, error } = await supabase
      .from("consultants")
      .select("id, normalized_name")
      .in("normalized_name", [...norms]);
    if (error) throw new Error(`failed to load consultants: ${error.message}`);
    for (const c of data ?? []) consultantByNorm.set(c.normalized_name, c.id);
  }

  // Group rows by claim_reference.
  const byClaim = new Map<string, InvoiceRowRow[]>();
  for (const r of allRows) {
    const bucket = byClaim.get(r.claim_reference);
    if (bucket) bucket.push(r);
    else byClaim.set(r.claim_reference, [r]);
  }

  type AggregateUpsert = {
    claim_reference: string;
    net_amount: number;
    latest_invoice_date: string;
    is_valid_op: boolean;
    row_count: number;
    lead_consultant_id: string | null;
    lead_expert_id: string | null;
    client_display_name: string | null;
    product: string | null;
    year_end_month: string | null;
    handover_complete_date: string | null;
    overview_complete_date: string | null;
    scoping_complete_date: string | null;
    tech_writeup_reviewed_date: string | null;
    cost_assessment_reviewed_date: string | null;
    financial_documents_received_date: string | null;
    costs_received_date: string | null;
    pre_notification_required: boolean | null;
    pre_notification_date: string | null;
    recomputed_at: string;
  };

  const toUpsert: AggregateUpsert[] = [];
  const toDelete: string[] = [];

  for (const ref of refs) {
    const rows = byClaim.get(ref) ?? [];
    if (rows.length === 0) {
      toDelete.push(ref);
      continue;
    }

    let net = 0;
    for (const r of rows) net += Number(r.amount_due_excl_tax ?? 0);
    net = Math.round(net * 100) / 100;

    // Latest invoice date wins for delivery date and "primary" row fallback.
    const sortedByDateDesc = [...rows].sort((a, b) => {
      const ad = a.invoice_date ?? "";
      const bd = b.invoice_date ?? "";
      if (ad === bd) return 0;
      return ad < bd ? 1 : -1;
    });
    const latest = sortedByDateDesc[0]!;
    if (!latest.invoice_date) {
      // Every row has a null invoice_date — shouldn't happen for valid rows
      // (validation enforces invoice_date is present), but tolerate it.
      continue;
    }

    /**
     * Pick a date field: latest row's value, or the latest non-null value
     * across rows when the latest is null.
     */
    const pickDate = (field: keyof InvoiceRowRow): string | null => {
      const fromLatest = latest[field] as string | null;
      if (fromLatest) return fromLatest;
      for (const r of sortedByDateDesc) {
        const v = r[field] as string | null;
        if (v) return v;
      }
      return null;
    };
    const pickString = (field: keyof InvoiceRowRow): string | null => {
      const fromLatest = latest[field] as string | null;
      if (fromLatest) return fromLatest;
      for (const r of sortedByDateDesc) {
        const v = r[field] as string | null;
        if (v) return v;
      }
      return null;
    };
    const pickBool = (field: keyof InvoiceRowRow): boolean | null => {
      const fromLatest = latest[field] as boolean | null;
      if (fromLatest !== null && fromLatest !== undefined) return fromLatest;
      for (const r of sortedByDateDesc) {
        const v = r[field] as boolean | null;
        if (v !== null && v !== undefined) return v;
      }
      return null;
    };

    const leadConsultantId =
      consultantByNorm.get(normalizeName(latest.lead_consultant_name) ?? "") ?? null;
    const leadExpertId = consultantByNorm.get(normalizeName(latest.lead_expert_name) ?? "") ?? null;

    toUpsert.push({
      claim_reference: ref,
      net_amount: net,
      latest_invoice_date: latest.invoice_date,
      is_valid_op: net > 0,
      row_count: rows.length,
      lead_consultant_id: leadConsultantId,
      lead_expert_id: leadExpertId,
      client_display_name: pickString("client_display_name"),
      product: pickString("product"),
      year_end_month: pickString("year_end_month"),
      handover_complete_date: pickDate("handover_complete_date"),
      overview_complete_date: pickDate("overview_complete_date"),
      scoping_complete_date: pickDate("scoping_complete_date"),
      tech_writeup_reviewed_date: pickDate("tech_writeup_reviewed_date"),
      cost_assessment_reviewed_date: pickDate("cost_assessment_reviewed_date"),
      financial_documents_received_date: pickDate("financial_documents_received_date"),
      costs_received_date: pickDate("costs_received_date"),
      pre_notification_required: pickBool("pre_notification_required"),
      pre_notification_date: pickDate("pre_notification_date"),
      recomputed_at: new Date().toISOString(),
    });
  }

  let upsertedCount = 0;
  if (toUpsert.length > 0) {
    // Chunked upsert keeps payload sizes sensible for very large reuploads.
    for (let i = 0; i < toUpsert.length; i += 200) {
      const chunk = toUpsert.slice(i, i + 200);
      const { error } = await supabase
        .from("claim_aggregates")
        .upsert(chunk, { onConflict: "claim_reference" });
      if (error) throw new Error(`failed to upsert claim_aggregates: ${error.message}`);
      upsertedCount += chunk.length;
    }
  }

  let deletedCount = 0;
  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 200) {
      const chunk = toDelete.slice(i, i + 200);
      const { error } = await supabase
        .from("claim_aggregates")
        .delete()
        .in("claim_reference", chunk);
      if (error) throw new Error(`failed to delete claim_aggregates: ${error.message}`);
      deletedCount += chunk.length;
    }
  }

  return { upsertedCount, deletedCount };
}
