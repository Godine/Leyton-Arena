import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { HistoryTable, type UploadHistoryRow } from "@/components/admin/history-table";

export const metadata = { title: "Upload history — Leyton Arena" };
export const dynamic = "force-dynamic";

export default async function AdminHistoryPage() {
  const service = createSupabaseServiceRoleClient();
  const { data: uploads } = await service
    .from("uploads")
    .select(
      "id, uploader_id, filename, file_size_bytes, row_count, status, notes, preview_summary, uploaded_at, committed_at, rolled_back_at, error_message",
    )
    .order("uploaded_at", { ascending: false })
    .limit(100);

  const uploaderIds = [
    ...new Set((uploads ?? []).map((u) => u.uploader_id).filter((x): x is string => !!x)),
  ];
  const { data: uploaders } = uploaderIds.length
    ? await service.from("consultants").select("id, display_name").in("id", uploaderIds)
    : { data: [] };
  const uploaderById = new Map((uploaders ?? []).map((u) => [u.id, u.display_name]));

  // The most recent committed upload is the only one with a "Rollback" action,
  // per the brief — to keep history auditable, rollback isn't a free-for-all.
  let mostRecentCommittedId: string | null = null;
  for (const u of uploads ?? []) {
    if (u.status === "committed") {
      mostRecentCommittedId = u.id;
      break;
    }
  }

  const rows: UploadHistoryRow[] = (uploads ?? []).map((u) => ({
    id: u.id,
    filename: u.filename,
    file_size_bytes: u.file_size_bytes,
    row_count: u.row_count,
    status: u.status as UploadHistoryRow["status"],
    notes: u.notes,
    preview_summary: (u.preview_summary as Record<string, unknown>) ?? null,
    uploaded_at: u.uploaded_at,
    committed_at: u.committed_at,
    rolled_back_at: u.rolled_back_at,
    error_message: u.error_message,
    uploader_id: u.uploader_id,
    uploader_display_name: u.uploader_id ? (uploaderById.get(u.uploader_id) ?? "Unknown") : "—",
    can_rollback: u.id === mostRecentCommittedId,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Upload history</h1>
        <p className="text-body text-muted-foreground">
          Audit log. Only the most recent committed upload can be rolled back.
        </p>
      </div>
      <HistoryTable rows={rows} />
    </div>
  );
}
