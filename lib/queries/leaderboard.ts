import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

export type LeaderboardPeriod = "this_month" | "last_month" | "last_90_days" | "all_time";

export interface LeaderboardRow {
  consultant_id: string;
  display_name: string;
  email: string | null;
  office: string | null;
  rank: number;
  ops_count: number;
  net_fees: number;
  avg_cycle_days: number | null;
  is_self: boolean;
}

export interface LeaderboardData {
  role: Role;
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
  yourRowIndex: number; // -1 when not on the board
}

function ymForPeriod(period: LeaderboardPeriod): { months: string[]; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
  if (period === "this_month") return { months: [ym(y, m)], label: "This month" };
  if (period === "last_month") {
    const lm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
    return { months: [ym(lm.y, lm.m)], label: "Last month" };
  }
  if (period === "last_90_days") {
    const months: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      months.push(ym(d.getUTCFullYear(), d.getUTCMonth() + 1));
    }
    return { months, label: "Last 90 days" };
  }
  return { months: [], label: "All time" };
}

export async function loadLeaderboardData(
  supabase: SupabaseClient,
  selfConsultantId: string,
  role: Role,
  period: LeaderboardPeriod,
  filters: { office: string | null; search: string | null },
): Promise<LeaderboardData> {
  const { months } = ymForPeriod(period);

  // Pull every monthly snapshot for the period, sum per consultant.
  let q = supabase
    .from("monthly_snapshots")
    .select("consultant_id, ops_count, net_fees, avg_cycle_days, rank, year_month")
    .eq("role", role);
  if (months.length === 1) q = q.eq("year_month", months[0]!);
  else if (months.length > 1) q = q.in("year_month", months);
  const { data: snaps } = await q;

  type Bucket = {
    consultant_id: string;
    ops_count: number;
    net_fees: number;
    cycleSum: number;
    cycleN: number;
  };
  const byConsultant = new Map<string, Bucket>();
  for (const s of snaps ?? []) {
    const b = byConsultant.get(s.consultant_id) ?? {
      consultant_id: s.consultant_id,
      ops_count: 0,
      net_fees: 0,
      cycleSum: 0,
      cycleN: 0,
    };
    b.ops_count += s.ops_count;
    b.net_fees += Number(s.net_fees);
    if (s.avg_cycle_days !== null) {
      b.cycleSum += Number(s.avg_cycle_days) * s.ops_count;
      b.cycleN += s.ops_count;
    }
    byConsultant.set(s.consultant_id, b);
  }

  // Hydrate display fields.
  const ids = [...byConsultant.keys()];
  let people: { id: string; display_name: string; email: string | null; office: string | null }[] =
    [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("consultants")
      .select("id, display_name, email, office")
      .in("id", ids);
    people = data ?? [];
  }
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const search = filters.search?.trim().toLowerCase() ?? "";
  const office = filters.office;

  let rows: LeaderboardRow[] = [...byConsultant.values()]
    .filter((b) => {
      const p = peopleById.get(b.consultant_id);
      if (!p) return false;
      if (office && p.office !== office) return false;
      if (search && !p.display_name.toLowerCase().includes(search)) return false;
      return true;
    })
    .map((b) => {
      const p = peopleById.get(b.consultant_id)!;
      return {
        consultant_id: b.consultant_id,
        display_name: p.display_name,
        email: p.email,
        office: p.office,
        rank: 0,
        ops_count: b.ops_count,
        net_fees: Math.round(b.net_fees * 100) / 100,
        avg_cycle_days: b.cycleN > 0 ? Math.round((b.cycleSum / b.cycleN) * 10) / 10 : null,
        is_self: b.consultant_id === selfConsultantId,
      };
    });

  rows.sort((a, b) => b.ops_count - a.ops_count || b.net_fees - a.net_fees);
  rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const yourRowIndex = rows.findIndex((r) => r.is_self);
  return { role, period, rows, yourRowIndex };
}

/**
 * Currently-held records used by the leaderboard's records strip. The keys we
 * surface are the most prominent four per the brief.
 */
export async function loadRecordsStrip(
  supabase: SupabaseClient,
  role: Role,
): Promise<
  Array<{
    record_key: string;
    role: Role;
    label: string;
    value_label: string;
    holder_id: string | null;
    holder_display_name: string;
  }>
> {
  const KEYS_BY_ROLE: Record<Role, string[]> = {
    technical: [
      "most_ops_month_technical",
      "fastest_tech_cycle",
      "largest_single_fee",
      "longest_iron_streak",
    ],
    financial: [
      "most_ops_month_financial",
      "fastest_financial_cycle",
      "fastest_docs_received",
      "longest_iron_streak",
    ],
  };
  const keys = KEYS_BY_ROLE[role];

  const { data } = await supabase
    .from("records")
    .select("record_key, role, holder_id, holder_display_name, value_label")
    .eq("is_current", true)
    .in("record_key", keys);

  return (data ?? [])
    .filter((r) => r.role === role || r.record_key === "largest_single_fee")
    .map((r) => ({
      record_key: r.record_key,
      role: r.role as Role,
      label: prettyLabel(r.record_key),
      value_label: r.value_label,
      holder_id: r.holder_id,
      holder_display_name: r.holder_display_name,
    }));
}

function prettyLabel(key: string): string {
  switch (key) {
    case "most_ops_month_technical":
      return "Most ops in a month";
    case "most_ops_month_financial":
      return "Most ops in a month";
    case "fastest_tech_cycle":
      return "Fastest tech cycle";
    case "fastest_financial_cycle":
      return "Fastest financial cycle";
    case "fastest_docs_received":
      return "Fastest costs received";
    case "largest_single_fee":
      return "Largest single fee";
    case "longest_iron_streak":
      return "Longest Iron Streak";
    default:
      return key.replaceAll("_", " ");
  }
}
