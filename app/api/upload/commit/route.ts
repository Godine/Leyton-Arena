import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ensureConsultantsForRows } from "@/lib/computations/consultants";
import { recomputeClaimAggregates } from "@/lib/computations/netting";
import { requireDirector } from "@/lib/supabase/guards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { summarizeParseResult } from "@/lib/parsers/excel";
import { fetchStagedPreview, removeStagedPreview, type StagedPreview } from "@/lib/upload/storage";
import { verifyPreviewToken } from "@/lib/upload/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  preview_token: z.string().min(10),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let claims;
  try {
    claims = await verifyPreviewToken(parsed.data.preview_token);
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_preview_token", detail: (err as Error).message },
      { status: 401 },
    );
  }

  const service = createSupabaseServiceRoleClient();

  let staged: StagedPreview;
  try {
    staged = await fetchStagedPreview(service, claims.sub);
  } catch (err) {
    return NextResponse.json(
      { error: "preview_expired_or_missing", detail: (err as Error).message },
      { status: 410 },
    );
  }

  // 1. Create the upload row in `previewed` state, capturing the summary.
  const summary = summarizeParseResult({
    rows: staged.rows,
    errors: staged.errors,
    headers: [],
    missingHeaders: [],
  });

  const { data: uploadRow, error: uploadErr } = await service
    .from("uploads")
    .insert({
      uploader_id: auth.consultant.id,
      filename: staged.filename,
      file_size_bytes: staged.fileSizeBytes,
      row_count: staged.rows.length,
      status: "previewed",
      notes: parsed.data.notes ?? null,
      preview_summary: summary,
    })
    .select("id")
    .single();

  if (uploadErr || !uploadRow) {
    return NextResponse.json(
      { error: "failed_to_create_upload", detail: uploadErr?.message },
      { status: 500 },
    );
  }
  const uploadId: string = uploadRow.id;

  try {
    // 2. Resolve consultants — create placeholders as needed.
    await ensureConsultantsForRows(service, staged.rows);

    // 3. Insert all invoice_rows in chunks, tagged with the upload id.
    const ROW_CHUNK = 500;
    for (let i = 0; i < staged.rows.length; i += ROW_CHUNK) {
      const chunk = staged.rows.slice(i, i + ROW_CHUNK).map((r) => ({
        upload_id: uploadId,
        claim_reference: r.claim_reference,
        client_display_name: r.client_display_name,
        product: r.product,
        invoice_date: r.invoice_date,
        untaxed_amount: r.untaxed_amount,
        amount_due_excl_tax: r.amount_due_excl_tax,
        year_end_month: r.year_end_month,
        lead_consultant_name: r.lead_consultant_name,
        lead_expert_name: r.lead_expert_name,
        handover_complete_date: r.handover_complete_date,
        overview_complete_date: r.overview_complete_date,
        scoping_complete_date: r.scoping_complete_date,
        tech_writeup_reviewed_date: r.tech_writeup_reviewed_date,
        tech_writeup_reviewer_name: r.tech_writeup_reviewer_name,
        cost_assessment_reviewed_date: r.cost_assessment_reviewed_date,
        cost_assessment_reviewer_name: r.cost_assessment_reviewer_name,
        financial_documents_received_date: r.financial_documents_received_date,
        costs_received_date: r.costs_received_date,
        business_developer_name: r.business_developer_name,
        last_payment_date: r.last_payment_date,
        scientific_writer_name: r.scientific_writer_name,
        financial_analyst_name: r.financial_analyst_name,
        pre_notification_required: r.pre_notification_required,
        pre_notification_date: r.pre_notification_date,
        raw_row: r.raw_row,
      }));
      const { error } = await service.from("invoice_rows").insert(chunk);
      if (error) throw new Error(`failed to insert invoice_rows: ${error.message}`);
    }

    // 4. Recompute aggregates for every claim referenced in the upload. We
    // pass every distinct claim_reference — netting will re-fetch all rows
    // (including pre-existing ones) and re-net from scratch.
    const refs = [...new Set(staged.rows.map((r) => r.claim_reference))];
    const netResult = await recomputeClaimAggregates(service, refs);

    // 5. Mark upload committed.
    const { error: finalizeErr } = await service
      .from("uploads")
      .update({ status: "committed", committed_at: new Date().toISOString() })
      .eq("id", uploadId);
    if (finalizeErr) throw new Error(`failed to finalize upload: ${finalizeErr.message}`);

    // Best-effort cleanup of the staged preview blob.
    await removeStagedPreview(service, claims.sub);

    return NextResponse.json({
      upload_id: uploadId,
      committed: true,
      row_count: staged.rows.length,
      claim_count: refs.length,
      aggregates_upserted: netResult.upsertedCount,
      aggregates_deleted: netResult.deletedCount,
    });
  } catch (err) {
    const message = (err as Error).message;
    await service
      .from("uploads")
      .update({ status: "failed", error_message: message })
      .eq("id", uploadId);
    // Drop any partial inserts so the next attempt is clean.
    await service.from("invoice_rows").delete().eq("upload_id", uploadId);

    return NextResponse.json({ error: "commit_failed", detail: message }, { status: 500 });
  }
}
