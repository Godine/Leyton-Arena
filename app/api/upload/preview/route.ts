import { NextResponse, type NextRequest } from "next/server";
import { parseInvoiceExport, summarizeParseResult } from "@/lib/parsers/excel";
import { requireDirector } from "@/lib/supabase/guards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { stagePreview } from "@/lib/upload/storage";
import { signPreviewToken } from "@/lib/upload/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  const auth = await requireDirector();
  if (!auth.ok) return auth.response;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing file field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file exceeds max size of ${MAX_BYTES} bytes` },
      { status: 413 },
    );
  }

  const buffer = await file.arrayBuffer();

  let result;
  try {
    result = parseInvoiceExport(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: "failed to parse file", detail: (err as Error).message },
      { status: 422 },
    );
  }

  const summary = summarizeParseResult(result);

  // Stage the parsed rows in storage so /commit doesn't have to re-parse and
  // doesn't have to receive the file a second time.
  const service = createSupabaseServiceRoleClient();
  const { key } = await stagePreview(service, auth.consultant.id, {
    filename: file.name,
    fileSizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    rows: result.rows,
    errors: result.errors,
  });

  const previewToken = await signPreviewToken({
    sub: key,
    filename: file.name,
    fileSizeBytes: file.size,
    rowCount: result.rows.length,
  });

  return NextResponse.json({
    preview_token: previewToken,
    filename: file.name,
    file_size_bytes: file.size,
    headers: result.headers,
    missing_headers: result.missingHeaders,
    errors: result.errors,
    summary,
  });
}
