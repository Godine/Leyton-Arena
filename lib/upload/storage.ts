import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoiceRow, ParseRowError } from "@/lib/types";

/**
 * The serialised payload we stash in Supabase Storage between
 * `/api/upload/preview` and `/api/upload/commit`. Keeping it out of the JWT
 * keeps tokens small even when uploads have tens of thousands of rows.
 */
export interface StagedPreview {
  filename: string;
  fileSizeBytes: number;
  uploadedAt: string;
  rows: ParsedInvoiceRow[];
  errors: ParseRowError[];
}

export function getPreviewBucket(): string {
  return process.env.UPLOAD_PREVIEW_BUCKET || "upload-previews";
}

function buildKey(uploaderId: string) {
  // Random suffix prevents two simultaneous previews from the same Director
  // from clobbering each other while still being readable in the Supabase
  // dashboard.
  const random = crypto.randomUUID();
  return `${uploaderId}/${Date.now()}-${random}.json`;
}

export async function stagePreview(
  supabase: SupabaseClient,
  uploaderId: string,
  payload: StagedPreview,
): Promise<{ key: string }> {
  const key = buildKey(uploaderId);
  const { error } = await supabase.storage
    .from(getPreviewBucket())
    .upload(key, JSON.stringify(payload), {
      contentType: "application/json",
      upsert: false,
    });
  if (error) throw new Error(`failed to stage preview: ${error.message}`);
  return { key };
}

export async function fetchStagedPreview(
  supabase: SupabaseClient,
  key: string,
): Promise<StagedPreview> {
  const { data, error } = await supabase.storage.from(getPreviewBucket()).download(key);
  if (error || !data) {
    throw new Error(`failed to fetch staged preview: ${error?.message ?? "no data"}`);
  }
  const text = await data.text();
  return JSON.parse(text) as StagedPreview;
}

export async function removeStagedPreview(supabase: SupabaseClient, key: string) {
  // Best-effort — if cleanup fails the preview blob will be garbage-collected
  // by a lifecycle rule. Don't crash the commit on this.
  await supabase.storage.from(getPreviewBucket()).remove([key]);
}
