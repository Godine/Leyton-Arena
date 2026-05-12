import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recomputeClaimAggregates } from "@/lib/computations/netting";
import { requireDirector } from "@/lib/supabase/guards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  upload_id: z.string().uuid(),
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
  const uploadId = parsed.data.upload_id;

  const service = createSupabaseServiceRoleClient();

  const { data: upload, error: uploadErr } = await service
    .from("uploads")
    .select("id, status")
    .eq("id", uploadId)
    .single();

  if (uploadErr || !upload) {
    return NextResponse.json({ error: "upload_not_found" }, { status: 404 });
  }
  if (upload.status === "rolled_back") {
    return NextResponse.json({ rolled_back: true, already: true, upload_id: uploadId });
  }
  if (upload.status !== "committed" && upload.status !== "failed") {
    return NextResponse.json(
      { error: "upload_not_rollbackable", status: upload.status },
      { status: 409 },
    );
  }

  // Snapshot the claim refs touched by this upload before deletion, so we
  // know which aggregates to re-net afterwards.
  const claimRefs = new Set<string>();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await service
      .from("invoice_rows")
      .select("claim_reference")
      .eq("upload_id", uploadId)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "failed_to_list_rows", detail: error.message },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;
    for (const r of data) claimRefs.add(r.claim_reference);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const { error: delErr } = await service.from("invoice_rows").delete().eq("upload_id", uploadId);
  if (delErr) {
    return NextResponse.json(
      { error: "failed_to_delete_rows", detail: delErr.message },
      { status: 500 },
    );
  }

  const refs = [...claimRefs];
  const netResult = await recomputeClaimAggregates(service, refs);

  const { error: markErr } = await service
    .from("uploads")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("id", uploadId);
  if (markErr) {
    return NextResponse.json(
      { error: "failed_to_mark_rolled_back", detail: markErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    rolled_back: true,
    upload_id: uploadId,
    claims_affected: refs.length,
    aggregates_upserted: netResult.upsertedCount,
    aggregates_deleted: netResult.deletedCount,
  });
}
