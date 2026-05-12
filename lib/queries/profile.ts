import type { SupabaseClient } from "@supabase/supabase-js";
import { BADGE_BY_KEY } from "@/lib/badges/catalog";
import type { BadgeDefinition } from "@/lib/badges/catalog";
import type { BadgeTier, Role } from "@/lib/types";
import type { ConsultantRow } from "@/lib/supabase/database.types";

export interface ProfileBadge {
  badge: BadgeDefinition;
  role: Role;
  tier: BadgeTier;
  earned_at: string;
}

export interface ProfileActivity {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ProfileData {
  consultant: ConsultantRow;
  lifetimeOps: number;
  lifetimeFees: number;
  bestStreak: number;
  recordsHeld: Array<{ record_key: string; role: Role; value_label: string }>;
  badges: ProfileBadge[];
  activity: ProfileActivity[];
  /** Current monthly rank in each role they have data for. */
  ranks: Array<{ role: Role; rank: number | null; total: number | null }>;
}

const TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "platinum", "diamond", "mythic"];

export async function loadProfile(
  supabase: SupabaseClient,
  consultantId: string,
): Promise<ProfileData | null> {
  const { data: consultant } = await supabase
    .from("consultants")
    .select("*")
    .eq("id", consultantId)
    .maybeSingle<ConsultantRow>();
  if (!consultant) return null;

  const [
    { data: techClaims },
    { data: finClaims },
    { data: streaks },
    { data: records },
    { data: earned },
    { data: monthSnaps },
    { data: activity },
  ] = await Promise.all([
    supabase
      .from("claim_aggregates")
      .select("net_amount, is_valid_op")
      .eq("lead_consultant_id", consultantId),
    supabase
      .from("claim_aggregates")
      .select("net_amount, is_valid_op")
      .eq("lead_expert_id", consultantId),
    supabase
      .from("streaks")
      .select("role, streak_type, best_count")
      .eq("consultant_id", consultantId),
    supabase
      .from("records")
      .select("record_key, role, value_label")
      .eq("holder_id", consultantId)
      .eq("is_current", true),
    supabase
      .from("badges_earned")
      .select("badge_key, role, tier, earned_at")
      .eq("consultant_id", consultantId)
      .order("earned_at", { ascending: false }),
    supabase
      .from("monthly_snapshots")
      .select("role, rank, total_consultants, year_month")
      .eq("consultant_id", consultantId)
      .order("year_month", { ascending: false }),
    supabase
      .from("notifications")
      .select("id, type, payload, created_at")
      .eq("consultant_id", consultantId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const allClaims = [...(techClaims ?? []), ...(finClaims ?? [])];
  const valid = allClaims.filter((c) => c.is_valid_op);
  const lifetimeOps = valid.length;
  const lifetimeFees = Math.round(valid.reduce((s, c) => s + Number(c.net_amount), 0) * 100) / 100;

  const bestStreak = (streaks ?? []).reduce((m, s) => (s.best_count > m ? s.best_count : m), 0);

  const badges: ProfileBadge[] = (
    (earned ?? []) as Array<{
      badge_key: string;
      role: Role;
      tier: BadgeTier;
      earned_at: string;
    }>
  )
    .filter((b) => BADGE_BY_KEY[b.badge_key])
    .map((b) => ({
      badge: BADGE_BY_KEY[b.badge_key]!,
      role: b.role,
      tier: b.tier,
      earned_at: b.earned_at,
    }))
    .sort((a, b) => {
      // Highest tier first within each badge, then most-recent earn.
      const ta = TIER_ORDER.indexOf(a.tier);
      const tb = TIER_ORDER.indexOf(b.tier);
      if (a.badge.key === b.badge.key) return tb - ta;
      return a.earned_at < b.earned_at ? 1 : -1;
    });

  const seen = new Map<Role, { rank: number | null; total: number | null }>();
  for (const s of monthSnaps ?? []) {
    if (seen.has(s.role as Role)) continue;
    seen.set(s.role as Role, { rank: s.rank, total: s.total_consultants });
  }
  const ranks: Array<{ role: Role; rank: number | null; total: number | null }> = [];
  if (consultant.has_technical_data) {
    ranks.push({ role: "technical", ...(seen.get("technical") ?? { rank: null, total: null }) });
  }
  if (consultant.has_financial_data) {
    ranks.push({ role: "financial", ...(seen.get("financial") ?? { rank: null, total: null }) });
  }

  return {
    consultant,
    lifetimeOps,
    lifetimeFees,
    bestStreak,
    recordsHeld: (records ?? []) as Array<{ record_key: string; role: Role; value_label: string }>,
    badges,
    activity: (activity ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      payload: a.payload as Record<string, unknown>,
      created_at: a.created_at,
    })),
    ranks,
  };
}
