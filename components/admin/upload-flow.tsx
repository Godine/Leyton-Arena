"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Trash2,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Stage =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "preview_error"; message: string }
  | { kind: "previewed"; preview: PreviewResponse; file: { name: string; size: number } }
  | {
      kind: "committing";
      step: CommitStep;
      preview: PreviewResponse;
      file: { name: string; size: number };
    }
  | { kind: "committed"; preview: PreviewResponse; result: CommitResponse }
  | {
      kind: "commit_error";
      message: string;
      preview: PreviewResponse;
      file: { name: string; size: number };
    };

type CommitStep = "uploading" | "committing" | "recomputing";

interface PreviewResponse {
  preview_token: string;
  filename: string;
  file_size_bytes: number;
  headers: string[];
  missing_headers: string[];
  errors: Array<{ excelRow: number; message: string; raw: Record<string, unknown> }>;
  summary: {
    rowCount: number;
    errorCount: number;
    earliestInvoiceDate: string | null;
    latestInvoiceDate: string | null;
    uniqueClaimCount: number;
    uniqueConsultantCount: number;
    totalUntaxedFees: number;
    totalAmountDueExclTax: number;
    sampleRows: Array<Record<string, unknown>>;
  };
}

interface CommitResponse {
  upload_id: string;
  committed: true;
  row_count: number;
  claim_count: number;
  aggregates_upserted: number;
  aggregates_deleted: number;
  recompute: {
    snapshots: { upserted: number; deleted: number };
    streaks: { upserted: number };
    badges: { inserted: number; removed: number; newlyEarnedCount: number };
    records: { changed: number; checked: number };
    notifications: { inserted: number };
  };
}

const COLUMN_ORDER = [
  "Claim/Account/Display Name",
  "Claim",
  "Product",
  "Invoice Date",
  "Untaxed Amount In Company Currency",
  "Invoice/Amount due Exl. Tax",
  "Claim/Account/Year End",
  "Claim/Lead consultant/Display Name",
  "Claim/Lead expert/Display Name",
  "Handover Complete Date",
  "Overview Complete Date",
  "Scoping Complete Date",
  "Tech Write-up Reviewed Date",
  "Claim/Tech Write-up Reviewer",
  "Cost Assessment Reviewed Date",
  "Claim/Cost Assessment Reviewer",
  "Claim/Financial Documents Received Date",
  "Claim/Costs Received Date",
  "Claim/Business Developer",
  "Invoice/Last payment date",
  "Claim/Scientific Writer",
  "Claim/Financial Analyst",
  "Pre-Notification Required",
  "Pre-notification submission date",
];

export function UploadFlow() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [showErrors, setShowErrors] = useState(false);
  const [notes, setNotes] = useState("");

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setStage({ kind: "previewing" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/preview", { method: "POST", body: fd });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: "preview_failed" }));
        setStage({
          kind: "preview_error",
          message: detail.detail ?? detail.error ?? `Preview failed (${res.status})`,
        });
        return;
      }
      const preview = (await res.json()) as PreviewResponse;
      setStage({
        kind: "previewed",
        preview,
        file: { name: file.name, size: file.size },
      });
    } catch (e) {
      setStage({ kind: "preview_error", message: (e as Error).message });
    }
  }, []);

  const dropzone = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    disabled: stage.kind === "previewing" || stage.kind === "committing",
  });

  function reset() {
    setStage({ kind: "idle" });
    setNotes("");
    setShowErrors(false);
  }

  async function commit() {
    if (stage.kind !== "previewed") return;
    setStage({ kind: "committing", step: "uploading", preview: stage.preview, file: stage.file });
    // Tiny artificial steps so the user sees progression on small uploads
    // where the backend round-trip is sub-second.
    setTimeout(
      () => setStage((s) => (s.kind === "committing" ? { ...s, step: "committing" } : s)),
      250,
    );
    setTimeout(
      () => setStage((s) => (s.kind === "committing" ? { ...s, step: "recomputing" } : s)),
      600,
    );
    try {
      const res = await fetch("/api/upload/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_token: stage.preview.preview_token,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: "commit_failed" }));
        setStage({
          kind: "commit_error",
          message: detail.detail ?? detail.error ?? `Commit failed (${res.status})`,
          preview: stage.preview,
          file: stage.file,
        });
        return;
      }
      const result = (await res.json()) as CommitResponse;
      setStage({ kind: "committed", preview: stage.preview, result });
    } catch (e) {
      setStage({
        kind: "commit_error",
        message: (e as Error).message,
        preview: stage.preview,
        file: stage.file,
      });
    }
  }

  const summary =
    stage.kind === "previewed" || stage.kind === "committing" || stage.kind === "commit_error"
      ? stage.preview.summary
      : stage.kind === "committed"
        ? stage.preview.summary
        : null;
  const errors =
    stage.kind === "previewed" ||
    stage.kind === "committing" ||
    stage.kind === "commit_error" ||
    stage.kind === "committed"
      ? stage.preview.errors
      : [];

  return (
    <div className="space-y-4">
      {/* Dropzone — always visible at the top so the next upload is one click away. */}
      {stage.kind !== "committed" ? (
        <div
          {...dropzone.getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card px-6 py-12 text-center transition-colors",
            dropzone.isDragActive && "border-primary bg-primary/5",
            (stage.kind === "previewing" || stage.kind === "committing") && "opacity-60",
          )}
        >
          <input {...dropzone.getInputProps()} />
          {stage.kind === "previewing" ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-control">Parsing...</p>
            </>
          ) : (
            <>
              <UploadIcon className="h-6 w-6 text-muted-foreground" />
              <p className="text-control">
                Drop today&apos;s invoice export here, or{" "}
                <span className="text-primary underline-offset-4 hover:underline">
                  click to browse
                </span>
              </p>
              <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                .xlsx only
              </p>
            </>
          )}
        </div>
      ) : null}

      {stage.kind === "preview_error" ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-1 h-5 w-5 text-destructive" />
            <div>
              <p className="text-control font-medium">Preview failed</p>
              <p className="text-body text-muted-foreground">{stage.message}</p>
            </div>
            <Button variant="outline" className="ml-auto" onClick={reset}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {summary &&
      stage.kind !== "idle" &&
      stage.kind !== "previewing" &&
      stage.kind !== "preview_error" ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-subhead">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                {"file" in stage ? stage.file.name : stage.preview.filename}
              </CardTitle>
              <p className="text-body text-muted-foreground">
                {summary.rowCount.toLocaleString()} rows · {summary.uniqueClaimCount} unique claims
                · {summary.uniqueConsultantCount} consultants · {summary.earliestInvoiceDate ?? "?"}{" "}
                → {summary.latestInvoiceDate ?? "?"}
              </p>
            </div>
            {stage.kind === "previewed" ? (
              <Button variant="outline" size="sm" onClick={reset}>
                <Trash2 className="h-4 w-4" />
                <span>Discard</span>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SmallStat label="Rows" value={summary.rowCount.toLocaleString()} />
              <SmallStat
                label="Total fees (excl. tax)"
                value={`£${Math.round(summary.totalAmountDueExclTax).toLocaleString()}`}
              />
              <SmallStat
                label="Untaxed gross"
                value={`£${Math.round(summary.totalUntaxedFees).toLocaleString()}`}
              />
              <SmallStat label="Validation errors" value={summary.errorCount.toString()} />
            </div>

            {stage.kind === "previewed" && stage.preview.missing_headers.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="text-control font-medium">Missing columns</p>
                  <p className="text-body text-muted-foreground">
                    {stage.preview.missing_headers.join(", ")} — commit blocked until the export
                    contains every required header.
                  </p>
                </div>
              </div>
            ) : null}

            {errors.length > 0 ? (
              <div className="rounded-md border border-border bg-background/60">
                <button
                  type="button"
                  onClick={() => setShowErrors((s) => !s)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-control"
                >
                  <span className="inline-flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-300" />
                    {errors.length} row{errors.length === 1 ? "" : "s"} skipped
                  </span>
                  <span className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                    {showErrors ? "Hide" : "Show"}
                  </span>
                </button>
                {showErrors ? (
                  <ul className="space-y-2 border-t border-border px-4 py-3 text-body">
                    {errors.map((e, i) => (
                      <li key={i} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-muted-foreground">
                            row {e.excelRow}
                          </span>
                          <span className="text-foreground">{e.message}</span>
                        </div>
                        <pre className="overflow-x-auto rounded bg-secondary/40 p-2 text-eyebrow text-muted-foreground">
                          {JSON.stringify(e.raw, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {COLUMN_ORDER.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.sampleRows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      {COLUMN_ORDER.map((h) => (
                        <TableCell
                          key={h}
                          className="whitespace-nowrap text-eyebrow tabular-nums text-muted-foreground"
                        >
                          {formatCell((row as Record<string, unknown>)[fieldFor(h)])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {stage.kind === "previewed" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes (audit log)"
                  className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-control placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={reset}>
                    Discard
                  </Button>
                  <Button onClick={commit} disabled={stage.preview.missing_headers.length > 0}>
                    <UploadIcon className="h-4 w-4" />
                    <span>Commit upload</span>
                  </Button>
                </div>
              </div>
            ) : null}

            {stage.kind === "committing" ? <CommitProgress step={stage.step} /> : null}

            {stage.kind === "commit_error" ? (
              <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-control font-medium">Commit failed</p>
                  <p className="text-body text-muted-foreground">{stage.message}</p>
                </div>
                <Button variant="outline" size="sm" onClick={commit}>
                  <RotateCcw className="h-4 w-4" />
                  <span>Retry</span>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {stage.kind === "committed" ? <CommitResult result={stage.result} onReset={reset} /> : null}
    </div>
  );
}

function CommitProgress({ step }: { step: CommitStep }) {
  const steps: { id: CommitStep; label: string }[] = useMemo(
    () => [
      { id: "uploading", label: "Uploading" },
      { id: "committing", label: "Committing rows" },
      { id: "recomputing", label: "Recomputing badges & records" },
    ],
    [],
  );
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <div className="space-y-3 rounded-md border border-border bg-background/60 p-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${Math.round(((idx + 1) / steps.length) * 100)}%` }}
        />
      </div>
      <ul className="space-y-1.5 text-body">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {i < idx ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : i === idx ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="inline-block h-4 w-4 rounded-full border border-border" />
            )}
            <span className={i <= idx ? "text-foreground" : "text-muted-foreground"}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommitResult({ result, onReset }: { result: CommitResponse; onReset: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Upload committed
          </CardTitle>
          <p className="text-body text-muted-foreground">
            Upload id <span className="font-mono">{result.upload_id.slice(0, 8)}</span> ·{" "}
            {result.row_count.toLocaleString()} rows · {result.claim_count} claims affected.
          </p>
        </div>
        <Button variant="outline" onClick={onReset}>
          New upload
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <SmallStat label="Aggregates upserted" value={result.aggregates_upserted.toString()} />
        <SmallStat label="Aggregates deleted" value={result.aggregates_deleted.toString()} />
        <SmallStat
          label="Snapshots"
          value={`${result.recompute.snapshots.upserted}`}
          hint={`-${result.recompute.snapshots.deleted}`}
        />
        <SmallStat label="Streaks updated" value={result.recompute.streaks.upserted.toString()} />
        <SmallStat
          label="Badges earned"
          value={result.recompute.badges.newlyEarnedCount.toString()}
          accent={result.recompute.badges.newlyEarnedCount > 0}
        />
      </CardContent>
      <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SmallStat label="Badges inserted" value={result.recompute.badges.inserted.toString()} />
        <SmallStat
          label="Records changed"
          value={result.recompute.records.changed.toString()}
          accent={result.recompute.records.changed > 0}
        />
        <SmallStat
          label="Notifications fired"
          value={result.recompute.notifications.inserted.toString()}
        />
      </CardContent>
      <CardContent className="text-body text-muted-foreground">
        <p className="flex items-center gap-2">
          <Badge variant="muted">Live</Badge>
          Notifications already delivered via Realtime — consultants on the site saw the toast.
        </p>
      </CardContent>
    </Card>
  );
}

function SmallStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-subhead tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value} {hint ? <span className="text-eyebrow text-muted-foreground">{hint}</span> : null}
      </p>
    </div>
  );
}

// The preview's sample row keys match the parser's internal field names, not
// the original Excel headers. Map for table rendering.
function fieldFor(header: string): string {
  return (
    {
      "Claim/Account/Display Name": "client_display_name",
      Claim: "claim_reference",
      Product: "product",
      "Invoice Date": "invoice_date",
      "Untaxed Amount In Company Currency": "untaxed_amount",
      "Invoice/Amount due Exl. Tax": "amount_due_excl_tax",
      "Claim/Account/Year End": "year_end_month",
      "Claim/Lead consultant/Display Name": "lead_consultant_name",
      "Claim/Lead expert/Display Name": "lead_expert_name",
      "Handover Complete Date": "handover_complete_date",
      "Overview Complete Date": "overview_complete_date",
      "Scoping Complete Date": "scoping_complete_date",
      "Tech Write-up Reviewed Date": "tech_writeup_reviewed_date",
      "Claim/Tech Write-up Reviewer": "tech_writeup_reviewer_name",
      "Cost Assessment Reviewed Date": "cost_assessment_reviewed_date",
      "Claim/Cost Assessment Reviewer": "cost_assessment_reviewer_name",
      "Claim/Financial Documents Received Date": "financial_documents_received_date",
      "Claim/Costs Received Date": "costs_received_date",
      "Claim/Business Developer": "business_developer_name",
      "Invoice/Last payment date": "last_payment_date",
      "Claim/Scientific Writer": "scientific_writer_name",
      "Claim/Financial Analyst": "financial_analyst_name",
      "Pre-Notification Required": "pre_notification_required",
      "Pre-notification submission date": "pre_notification_date",
    }[header] ?? header
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "YES" : "NO";
  return String(value);
}
