"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface UploadHistoryRow {
  id: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  status: "pending" | "previewed" | "committed" | "rolled_back" | "failed";
  notes: string | null;
  preview_summary: Record<string, unknown> | null;
  uploaded_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
  error_message: string | null;
  uploader_id: string | null;
  uploader_display_name: string;
  can_rollback: boolean;
}

const STATUSES: UploadHistoryRow["status"][] = [
  "pending",
  "previewed",
  "committed",
  "rolled_back",
  "failed",
];

const STATUS_VARIANT: Record<
  UploadHistoryRow["status"],
  "default" | "muted" | "warning" | "destructive" | "outline" | "success"
> = {
  pending: "outline",
  previewed: "muted",
  committed: "success",
  rolled_back: "warning",
  failed: "destructive",
};

export function HistoryTable({ rows }: { rows: UploadHistoryRow[] }) {
  const router = useRouter();
  const [uploader, setUploader] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [summaryRow, setSummaryRow] = useState<UploadHistoryRow | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<UploadHistoryRow | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const uploaderOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) if (r.uploader_id) set.set(r.uploader_id, r.uploader_display_name);
    return [...set.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (uploader && r.uploader_id !== uploader) return false;
    if (status && r.status !== status) return false;
    if (query && !r.filename.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function doRollback() {
    if (!rollbackTarget) return;
    setRollbackError(null);
    try {
      const res = await fetch("/api/upload/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_id: rollbackTarget.id }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: "rollback_failed" }));
        setRollbackError(detail.detail ?? detail.error ?? `Rollback failed (${res.status})`);
        return;
      }
      setRollbackTarget(null);
      startTransition(() => router.refresh());
    } catch (e) {
      setRollbackError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={uploader}
          onChange={(e) => setUploader(e.target.value)}
          className="max-w-52"
        >
          <option value="">All uploaders</option>
          {uploaderOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="max-w-44"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filename"
          className="h-8 w-48"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Uploader</TableHead>
              <TableHead>Filename</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No uploads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-body">
                    <div>{format(new Date(r.uploaded_at), "d MMM yyyy, HH:mm")}</div>
                    <div className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                      {formatDistanceToNow(new Date(r.uploaded_at), { addSuffix: true })}
                    </div>
                  </TableCell>
                  <TableCell>{r.uploader_display_name}</TableCell>
                  <TableCell className="font-mono">{r.filename}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {r.row_count.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
                      {r.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-72 truncate text-body text-muted-foreground">
                    {summaryFor(r)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSummaryRow(r)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!r.can_rollback}
                        onClick={() => {
                          setRollbackError(null);
                          setRollbackTarget(r);
                        }}
                        title={
                          r.can_rollback
                            ? ""
                            : "Only the most recent committed upload can be rolled back."
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>Rollback</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!summaryRow} onClose={() => setSummaryRow(null)} width="lg">
        {summaryRow ? (
          <>
            <DialogHeader>
              <DialogTitle>{summaryRow.filename}</DialogTitle>
              <DialogDescription>
                Uploaded {format(new Date(summaryRow.uploaded_at), "d MMM yyyy, HH:mm")} by{" "}
                {summaryRow.uploader_display_name}.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3 text-body">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryCell label="Rows" value={summaryRow.row_count.toLocaleString()} />
                <SummaryCell label="Status" value={summaryRow.status.replace("_", " ")} />
                <SummaryCell
                  label="Size"
                  value={`${Math.round(summaryRow.file_size_bytes / 1024)} kB`}
                />
                <SummaryCell
                  label="Committed at"
                  value={
                    summaryRow.committed_at
                      ? format(new Date(summaryRow.committed_at), "d MMM, HH:mm")
                      : "—"
                  }
                />
              </div>
              {summaryRow.preview_summary ? (
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background/40 p-3 text-eyebrow text-muted-foreground">
                  {JSON.stringify(summaryRow.preview_summary, null, 2)}
                </pre>
              ) : null}
              {summaryRow.error_message ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-body text-destructive">
                  {summaryRow.error_message}
                </div>
              ) : null}
              {summaryRow.notes ? (
                <p className="text-body text-muted-foreground">
                  <span className="text-foreground">Notes:</span> {summaryRow.notes}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSummaryRow(null)}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>

      <Dialog open={!!rollbackTarget} onClose={() => setRollbackTarget(null)}>
        {rollbackTarget ? (
          <>
            <DialogHeader>
              <DialogTitle>Rollback upload</DialogTitle>
              <DialogDescription>
                This will remove every row from this upload, re-net affected claims, and undo badge
                tiers that became unreachable. Notifications already sent are not retracted.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-2 text-body">
              <p className="font-mono">{rollbackTarget.filename}</p>
              <p className="text-muted-foreground">
                {rollbackTarget.row_count.toLocaleString()} rows · committed{" "}
                {rollbackTarget.committed_at
                  ? formatDistanceToNow(new Date(rollbackTarget.committed_at), { addSuffix: true })
                  : "?"}
              </p>
              {rollbackError ? (
                <p
                  className={cn(
                    "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive",
                  )}
                >
                  {rollbackError}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRollbackTarget(null)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={doRollback} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                <span>Confirm rollback</span>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-control tabular-nums">{value}</p>
    </div>
  );
}

function summaryFor(r: UploadHistoryRow): string {
  if (r.status === "failed") return r.error_message ?? "Failed";
  const s = r.preview_summary;
  if (!s) return r.notes ?? "—";
  const claims = (s.uniqueClaimCount ?? s.unique_claim_count ?? null) as number | null;
  const fees = (s.totalAmountDueExclTax ?? null) as number | null;
  const bits: string[] = [];
  if (claims !== null) bits.push(`${claims} claims`);
  if (fees !== null) bits.push(`£${Math.round(fees).toLocaleString()}`);
  return bits.length > 0 ? bits.join(" · ") : (r.notes ?? "—");
}
