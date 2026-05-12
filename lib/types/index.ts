/**
 * Shared domain types. Database row shapes use `snake_case` to mirror Postgres;
 * application-level types use `camelCase`. Conversions live in lib/supabase.
 */

export type Role = "technical" | "financial";
export type PrimaryRole = Role | "both";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "mythic";

export type UploadStatus = "pending" | "previewed" | "committed" | "rolled_back" | "failed";

/**
 * One parsed row from the Odoo `account.invoice.fx.report` export. Mirrors the
 * `invoice_rows` Postgres table, minus the FK / book-keeping columns that only
 * exist after insertion.
 */
export interface ParsedInvoiceRow {
  client_display_name: string | null;
  claim_reference: string;
  product: string | null;
  invoice_date: string | null; // ISO YYYY-MM-DD
  untaxed_amount: number | null;
  amount_due_excl_tax: number | null;
  year_end_month: string | null;
  lead_consultant_name: string | null;
  lead_expert_name: string | null;
  handover_complete_date: string | null;
  overview_complete_date: string | null;
  scoping_complete_date: string | null;
  tech_writeup_reviewed_date: string | null;
  tech_writeup_reviewer_name: string | null;
  cost_assessment_reviewed_date: string | null;
  cost_assessment_reviewer_name: string | null;
  financial_documents_received_date: string | null;
  costs_received_date: string | null;
  business_developer_name: string | null;
  last_payment_date: string | null;
  scientific_writer_name: string | null;
  financial_analyst_name: string | null;
  pre_notification_required: boolean | null;
  pre_notification_date: string | null;
  raw_row: Record<string, unknown>;
}

export interface ParseRowError {
  /** 1-indexed Excel row number (header is row 1, first data row is row 2). */
  excelRow: number;
  message: string;
  issues: { path: string; message: string }[];
  raw: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedInvoiceRow[];
  errors: ParseRowError[];
  /** Headers that were present in the file (in original order). */
  headers: string[];
  /** Headers from the canonical schema that were missing — empty if all 24 present. */
  missingHeaders: string[];
}

export interface PreviewSummary {
  rowCount: number;
  errorCount: number;
  earliestInvoiceDate: string | null;
  latestInvoiceDate: string | null;
  uniqueClaimCount: number;
  uniqueConsultantCount: number;
  totalUntaxedFees: number;
  totalAmountDueExclTax: number;
  sampleRows: ParsedInvoiceRow[];
}

export interface PreviewTokenClaims {
  /** Subject — the storage object key the parsed rows were uploaded to. */
  sub: string;
  /** Issued-at (seconds). */
  iat: number;
  /** Expiry (seconds). 24h after issue. */
  exp: number;
  filename: string;
  fileSizeBytes: number;
  rowCount: number;
}
