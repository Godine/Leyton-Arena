/**
 * Hand-maintained Supabase row types. Generated types from `supabase gen
 * types typescript` should eventually replace this — keep the shapes here in
 * sync with `supabase/migrations/*.sql` until that wiring lands.
 */
import type { BadgeTier, PrimaryRole, Role, UploadStatus } from "@/lib/types";

export interface ConsultantRow {
  id: string;
  email: string | null;
  display_name: string;
  normalized_name: string;
  primary_role: PrimaryRole;
  office: string | null;
  has_technical_data: boolean;
  has_financial_data: boolean;
  is_director: boolean;
  joined_at: string;
}

export interface UploadRow {
  id: string;
  uploader_id: string | null;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  status: UploadStatus;
  notes: string | null;
  preview_summary: unknown;
  uploaded_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
  error_message: string | null;
}

export interface InvoiceRowRow {
  id: string;
  upload_id: string;
  claim_reference: string;
  client_display_name: string | null;
  product: string | null;
  invoice_date: string | null;
  untaxed_amount: string | null;
  amount_due_excl_tax: string | null;
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
  created_at: string;
}

export interface ClaimAggregateRow {
  claim_reference: string;
  net_amount: string;
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
}

export interface BadgeEarnedRow {
  id: string;
  consultant_id: string;
  badge_key: string;
  role: Role;
  tier: BadgeTier;
  earned_at: string;
  progress_data: Record<string, unknown> | null;
}
