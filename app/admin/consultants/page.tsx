import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ConsultantRow } from "@/lib/supabase/database.types";
import { ConsultantsTable, type ConsultantTableRow } from "./consultants-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consultants — Leyton Arena" };

export default async function AdminConsultantsPage() {
  const service = createSupabaseServiceRoleClient();

  // Directors should see everyone, including unlinked placeholders. The
  // service-role client bypasses RLS so we don't have to grant directors a
  // broader RLS rule than necessary.
  const { data: consultants, error } = await service
    .from("consultants")
    .select("*")
    .order("display_name", { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-body">
        Failed to load consultants: {error.message}
      </div>
    );
  }

  // Compute "last seen in data" per consultant by joining against
  // claim_aggregates. We do this server-side so the table component stays a
  // dumb renderer.
  const ids = (consultants ?? []).map((c) => c.id);
  const lastSeen = new Map<string, string>();
  if (ids.length > 0) {
    const { data: agg } = await service
      .from("claim_aggregates")
      .select(
        "lead_consultant_id, lead_expert_id, tech_writeup_reviewer_id, cost_assessment_reviewer_id, latest_invoice_date",
      );
    for (const row of agg ?? []) {
      const candidates = [
        row.lead_consultant_id,
        row.lead_expert_id,
        row.tech_writeup_reviewer_id,
        row.cost_assessment_reviewer_id,
      ];
      for (const id of candidates) {
        if (!id || !row.latest_invoice_date) continue;
        const cur = lastSeen.get(id);
        if (!cur || row.latest_invoice_date > cur) lastSeen.set(id, row.latest_invoice_date);
      }
    }
  }

  const rows: ConsultantTableRow[] = ((consultants ?? []) as ConsultantRow[]).map((c) => ({
    id: c.id,
    display_name: c.display_name,
    email: c.email,
    office: c.office,
    primary_role: c.primary_role,
    has_technical_data: c.has_technical_data,
    has_financial_data: c.has_financial_data,
    is_director: c.is_director,
    last_seen_in_data: lastSeen.get(c.id) ?? c.last_seen_in_data,
    auth_user_id: c.auth_user_id,
  }));

  return <ConsultantsTable consultants={rows} />;
}
