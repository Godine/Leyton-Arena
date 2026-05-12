import * as XLSX from "xlsx";
import { z } from "zod";
import { nonEmpty } from "./normalize";
import type { ParseResult, ParseRowError, ParsedInvoiceRow } from "@/lib/types";

/**
 * Canonical Odoo-export column headers, mapped to the parsed-row field they
 * populate. Order here is the order surfaced to admins in the preview UI;
 * matching is by header text, not column index, so re-ordered exports are
 * fine.
 */
export const COLUMN_MAP = {
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
} as const satisfies Record<string, keyof ParsedInvoiceRow | "pre_notification_required">;

export const CANONICAL_HEADERS = Object.keys(COLUMN_MAP);

/**
 * Columns whose values should be parsed as dates and stored as ISO YYYY-MM-DD.
 */
const DATE_FIELDS = new Set<keyof ParsedInvoiceRow>([
  "invoice_date",
  "handover_complete_date",
  "overview_complete_date",
  "scoping_complete_date",
  "tech_writeup_reviewed_date",
  "cost_assessment_reviewed_date",
  "financial_documents_received_date",
  "costs_received_date",
  "last_payment_date",
  "pre_notification_date",
]);

/**
 * Columns whose values should be parsed as numerics.
 */
const NUMERIC_FIELDS = new Set<keyof ParsedInvoiceRow>(["untaxed_amount", "amount_due_excl_tax"]);

/**
 * Convert an Excel serial date (number of days since 1899-12-30, with the
 * 1900 leap-year bug baked in) to an ISO date string. Returns null for empty
 * cells.
 *
 * We deliberately use SheetJS's SSF helper so the 1900 quirk is handled the
 * same way Excel does it. Pure-JS conversions would diverge for dates before
 * 1 March 1900 — not relevant for invoicing data, but still worth getting
 * right at the boundary.
 */
function excelDateToISO(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Already an ISO-ish date? Pass through if it parses.
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const parts = XLSX.SSF.parse_date_code(value);
  if (!parts) return null;
  const y = String(parts.y).padStart(4, "0");
  const m = String(parts.m).padStart(2, "0");
  const d = String(parts.d).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBooleanYesNo(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toUpperCase();
  if (s === "") return null;
  if (s === "YES" || s === "Y" || s === "TRUE") return true;
  if (s === "NO" || s === "N" || s === "FALSE") return false;
  return null;
}

/**
 * Zod schema for a single parsed row. Validation here protects the database
 * — bad rows are returned to the admin in the preview rather than inserted.
 */
const RowSchema = z
  .object({
    claim_reference: z.string().min(1, "claim reference is required"),
    invoice_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "invoice_date must be a valid date")
      .nullable(),
    untaxed_amount: z.number().nullable(),
    amount_due_excl_tax: z.number().nullable(),
  })
  .refine((r) => r.invoice_date !== null, {
    message: "invoice_date is required",
    path: ["invoice_date"],
  });

/**
 * Parse the buffer of an account.invoice.fx.report export. Pure: no DB calls,
 * no side effects.
 */
export function parseInvoiceExport(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], errors: [], headers: [], missingHeaders: [...CANONICAL_HEADERS] };
  }
  const sheet = workbook.Sheets[firstSheetName]!;

  // sheet_to_json with `header: 1` returns an array of arrays so we keep
  // header row indices, which makes error reporting accurate.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  if (matrix.length === 0) {
    return { rows: [], errors: [], headers: [], missingHeaders: [...CANONICAL_HEADERS] };
  }

  const headerRow = (matrix[0] ?? []).map((h) =>
    typeof h === "string" ? h.trim() : String(h ?? "").trim(),
  );
  const missingHeaders = CANONICAL_HEADERS.filter((h) => !headerRow.includes(h));

  // Build header -> column index map for fast lookup. Unknown columns in the
  // export are tolerated; they pass through into `raw_row` but otherwise are
  // ignored.
  const headerIndex = new Map<string, number>();
  headerRow.forEach((h, i) => headerIndex.set(h, i));

  const rows: ParsedInvoiceRow[] = [];
  const errors: ParseRowError[] = [];

  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const row = matrix[rIdx] ?? [];
    const excelRowNumber = rIdx + 1;

    // Skip fully-empty trailing rows the way Excel-generated files often have.
    const allEmpty = row.every((cell) => cell == null || cell === "");
    if (allEmpty) continue;

    const raw: Record<string, unknown> = {};
    for (const [header, idx] of headerIndex) raw[header] = row[idx] ?? null;

    const partial: Partial<ParsedInvoiceRow> = { raw_row: raw };

    for (const [header, field] of Object.entries(COLUMN_MAP) as [
      string,
      keyof ParsedInvoiceRow,
    ][]) {
      const idx = headerIndex.get(header);
      const cell = idx == null ? null : (row[idx] ?? null);

      if (field === "pre_notification_required") {
        partial.pre_notification_required = toBooleanYesNo(cell);
      } else if (DATE_FIELDS.has(field)) {
        (partial as Record<string, unknown>)[field] = excelDateToISO(cell);
      } else if (NUMERIC_FIELDS.has(field)) {
        (partial as Record<string, unknown>)[field] = toNumber(cell);
      } else {
        // Everything else is a trimmed string.
        (partial as Record<string, unknown>)[field] = nonEmpty(
          typeof cell === "string" ? cell : cell == null ? null : String(cell),
        );
      }
    }

    const parsed = RowSchema.safeParse(partial);
    if (!parsed.success) {
      errors.push({
        excelRow: excelRowNumber,
        message: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(row)"}: ${i.message}`)
          .join("; "),
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        raw,
      });
      continue;
    }

    rows.push(partial as ParsedInvoiceRow);
  }

  return { rows, errors, headers: headerRow, missingHeaders };
}

/**
 * Summarise a parse result for the preview UI. Cheap to compute and small
 * enough to round-trip through a JWT-bound preview token.
 */
export function summarizeParseResult(result: ParseResult, sampleSize = 10) {
  const rows = result.rows;
  let earliest: string | null = null;
  let latest: string | null = null;
  let untaxedTotal = 0;
  let amountDueTotal = 0;
  const claims = new Set<string>();
  const consultants = new Set<string>();

  for (const r of rows) {
    if (r.invoice_date) {
      if (!earliest || r.invoice_date < earliest) earliest = r.invoice_date;
      if (!latest || r.invoice_date > latest) latest = r.invoice_date;
    }
    untaxedTotal += r.untaxed_amount ?? 0;
    amountDueTotal += r.amount_due_excl_tax ?? 0;
    claims.add(r.claim_reference);
    if (r.lead_consultant_name) consultants.add(r.lead_consultant_name);
    if (r.lead_expert_name) consultants.add(r.lead_expert_name);
  }

  return {
    rowCount: rows.length,
    errorCount: result.errors.length,
    earliestInvoiceDate: earliest,
    latestInvoiceDate: latest,
    uniqueClaimCount: claims.size,
    uniqueConsultantCount: consultants.size,
    totalUntaxedFees: Math.round(untaxedTotal * 100) / 100,
    totalAmountDueExclTax: Math.round(amountDueTotal * 100) / 100,
    sampleRows: rows.slice(0, sampleSize),
  };
}
