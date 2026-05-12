import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_BY_KEY } from "@/lib/badges/catalog";
import type { Role } from "@/lib/types";

export interface DirectorDashboardData {
  currentMonth: string;
  totals: {
    opsThisMonth: number;
    feesThisMonth: number;
    activeConsultants: number;
    avgCycleDays: number | null;
  };
  activity: ActivityRow[];
  underperforming: {
    technical: UnderperformingRow[];
    financial: UnderperformingRow[];
  };
  lastCommitAt: string | null;
}

export interface ActivityRow {
  id: string;
  consultant_id: string;
  consultant_display_name: string;
  consultant_email: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
  /** Pretty title for the feed. Computed server-side. */
  title: string;
}

export interface UnderperformingRow {
  consultant_id: string;
  display_name: string;
  email: string | null;
  office: string | null;
  ops_count: number;
}

export async function loadDirectorDashboard(
  supabase: SupabaseClient,
): Promise<DirectorDashboardData> {
  const now = new Date();
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStart = `${currentMonth}-01`;
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthEnd = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

  // 1. Totals: pull this month's valid claim_aggregates once and roll up.
  const { data: claims } = await supabase
    .from("claim_aggregates")
    .select(
      "net_amount, handover_complete_date, tech_writeup_reviewed_date, cost_assessment_reviewed_date, lead_consultant_id, lead_expert_id",
    )
    .eq("is_valid_op", true)
    .gte("latest_invoice_date", monthStart)
    .lte("latest_invoice_date", monthEnd);

  let opsThisMonth = 0;
  let feesThisMonth = 0;
  const activeConsultants = new Set<string>();
  const cycles: number[] = [];
  for (const c of claims ?? []) {
    opsThisMonth += 1;
    feesThisMonth += Number(c.net_amount);
    if (c.lead_consultant_id) activeConsultants.add(c.lead_consultant_id);
    if (c.lead_expert_id) activeConsultants.add(c.lead_expert_id);
    // Take whichever cycle end is present per claim.
    const start = c.handover_complete_date
      ? new Date(`${c.handover_complete_date}T00:00:00Z`).getTime()
      : null;
    const ends = [c.tech_writeup_reviewed_date, c.cost_assessment_reviewed_date]
      .filter((d): d is string => !!d)
      .map((d) => new Date(`${d}T00:00:00Z`).getTime());
    if (start && ends.length > 0) {
      const days = Math.round((Math.max(...ends) - start) / 86400000);
      if (days >= 0) cycles.push(days);
    }
  }
  const avgCycleDays = cycles.length
    ? Math.round((cycles.reduce((s, d) => s + d, 0) / cycles.length) * 10) / 10
    : null;

  // 2. Activity since the last committed upload.
  const { data: lastUpload } = await supabase
    .from("uploads")
    .select("committed_at")
    .eq("status", "committed")
    .order("committed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sinceISO = lastUpload?.committed_at ?? new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, consultant_id, type, payload, created_at")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(50);

  const personIds = [...new Set((notifs ?? []).map((n) => n.consultant_id))];
  const { data: persons } = personIds.length
    ? await supabase.from("consultants").select("id, display_name, email").in("id", personIds)
    : { data: [] };
  const personById = new Map((persons ?? []).map((p) => [p.id, p]));

  const activity: ActivityRow[] = (notifs ?? []).map((n) => {
    const p = personById.get(n.consultant_id);
    return {
      id: n.id,
      consultant_id: n.consultant_id,
      consultant_display_name: p?.display_name ?? "Unknown",
      consultant_email: p?.email ?? null,
      type: n.type,
      payload: n.payload as Record<string, unknown>,
      created_at: n.created_at,
      title: activityTitle(
        n.type,
        n.payload as Record<string, unknown>,
        p?.display_name ?? "Someone",
      ),
    };
  });

  // 3. Underperforming — bottom 5 by ops_count per role in this month, but
  //    only among consultants who have ANY ops this month (zero-op consultants
  //    aren't surfaced; they may be on leave).
  const { data: snaps } = await supabase
    .from("monthly_snapshots")
    .select("consultant_id, role, ops_count, total_consultants, rank")
    .eq("year_month", currentMonth);
  const consIdsForSnaps = [...new Set((snaps ?? []).map((s) => s.consultant_id))];
  const { data: peopleForSnaps } = consIdsForSnaps.length
    ? await supabase
        .from("consultants")
        .select("id, display_name, email, office")
        .in("id", consIdsForSnaps)
    : { data: [] };
  const peopleById = new Map((peopleForSnaps ?? []).map((p) => [p.id, p]));

  const byRole = (role: Role): UnderperformingRow[] => {
    return (snaps ?? [])
      .filter((s) => s.role === role)
      .sort((a, b) => a.ops_count - b.ops_count)
      .slice(0, 5)
      .map((s) => {
        const p = peopleById.get(s.consultant_id);
        return {
          consultant_id: s.consultant_id,
          display_name: p?.display_name ?? "Unknown",
          email: p?.email ?? null,
          office: p?.office ?? null,
          ops_count: s.ops_count,
        };
      });
  };

  return {
    currentMonth,
    totals: {
      opsThisMonth,
      feesThisMonth: Math.round(feesThisMonth * 100) / 100,
      activeConsultants: activeConsultants.size,
      avgCycleDays,
    },
    activity,
    underperforming: { technical: byRole("technical"), financial: byRole("financial") },
    lastCommitAt: lastUpload?.committed_at ?? null,
  };
}

function activityTitle(
  type: string,
  payload: Record<string, unknown>,
  consultantName: string,
): string {
  if (type === "badge_unlock") {
    const badge = BADGE_BY_KEY[String(payload.badge_key)];
    const name = badge?.name ?? String(payload.badge_name);
    const tier = String(payload.tier);
    return `${consultantName} unlocked ${name} ${capitalize(tier)}`;
  }
  if (type === "record_taken") {
    return `${consultantName} took ${prettyRecord(String(payload.record_key))} (${String(payload.value_label)})`;
  }
  if (type === "record_lost") {
    return `${consultantName} lost ${prettyRecord(String(payload.record_key))} to ${String(payload.new_holder_name)}`;
  }
  if (type === "streak_milestone") {
    return `${consultantName} hit a streak milestone — ${String(payload.streak_type)}`;
  }
  return `${consultantName} · ${type}`;
}

function prettyRecord(k: string): string {
  return k.replaceAll("_", " ");
}
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
