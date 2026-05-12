import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

export interface RecordView {
  record_key: string;
  role: Role;
  label: string;
  description: string;
  value_label: string;
  holder_id: string | null;
  holder_display_name: string;
  holder_office: string | null;
  holder_email: string | null;
  achieved_at: string;
  previous: Array<{ holder_display_name: string; value_label: string; achieved_at: string }>;
  is_self_held: boolean;
}

const META: Record<string, { label: string; description: string; role: Role }> = {
  most_ops_month_technical: {
    label: "Most ops in a month",
    description: "Highest single-month ops_count as the lead consultant.",
    role: "technical",
  },
  most_ops_month_financial: {
    label: "Most ops in a month",
    description: "Highest single-month ops_count as the lead expert.",
    role: "financial",
  },
  fastest_tech_cycle: {
    label: "Fastest tech cycle",
    description: "Smallest handover-to-tech-writeup-reviewed gap.",
    role: "technical",
  },
  fastest_financial_cycle: {
    label: "Fastest financial cycle",
    description: "Smallest handover-to-cost-assessment-reviewed gap.",
    role: "financial",
  },
  fastest_docs_received: {
    label: "Fastest costs received",
    description: "Smallest handover-to-costs-received gap.",
    role: "financial",
  },
  largest_single_fee: {
    label: "Largest single fee",
    description: "Highest net_amount on any claim.",
    role: "technical",
  },
  longest_iron_streak: {
    label: "Longest Iron Streak",
    description: "Most consecutive months hitting Op Machine threshold.",
    role: "technical",
  },
  most_ops_lifetime_technical: {
    label: "Most ops lifetime",
    description: "Highest lifetime count of valid ops as lead consultant.",
    role: "technical",
  },
  most_ops_lifetime_financial: {
    label: "Most ops lifetime",
    description: "Highest lifetime count of valid ops as lead expert.",
    role: "financial",
  },
};

export async function loadAllRecords(
  supabase: SupabaseClient,
  selfConsultantId: string,
): Promise<RecordView[]> {
  const { data: current } = await supabase.from("records").select("*").eq("is_current", true);

  const { data: history } = await supabase
    .from("records")
    .select("record_key, role, holder_display_name, value_label, achieved_at")
    .eq("is_current", false)
    .order("set_at", { ascending: false });

  const offices = new Map<string, { office: string | null; email: string | null }>();
  const ids = (current ?? []).map((r) => r.holder_id).filter(Boolean) as string[];
  if (ids.length) {
    const { data } = await supabase.from("consultants").select("id, office, email").in("id", ids);
    for (const c of data ?? []) offices.set(c.id, { office: c.office, email: c.email });
  }

  const out: RecordView[] = [];
  for (const r of current ?? []) {
    const meta = META[r.record_key];
    if (!meta) continue;
    const prev = (history ?? [])
      .filter((h) => h.record_key === r.record_key && h.role === r.role)
      .slice(0, 3)
      .map((h) => ({
        holder_display_name: h.holder_display_name,
        value_label: h.value_label,
        achieved_at: h.achieved_at,
      }));
    const personal = r.holder_id ? offices.get(r.holder_id) : null;
    out.push({
      record_key: r.record_key,
      role: r.role as Role,
      label: meta.label,
      description: meta.description,
      value_label: r.value_label,
      holder_id: r.holder_id,
      holder_display_name: r.holder_display_name,
      holder_office: personal?.office ?? null,
      holder_email: personal?.email ?? null,
      achieved_at: r.achieved_at,
      previous: prev,
      is_self_held: r.holder_id === selfConsultantId,
    });
  }
  return out;
}
