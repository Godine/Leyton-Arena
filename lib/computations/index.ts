import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeBadges } from "./badges";
import { recomputeRecords } from "./records";
import { recomputeMonthlySnapshots } from "./snapshots";
import { recomputeStreaks } from "./streaks";

export interface RecomputeContext {
  affectedClaims: string[];
  affectedConsultants: string[];
  affectedMonths: string[];
  mode: "commit" | "rollback";
  asOfDate?: Date;
}

export interface RecomputeSummary {
  snapshots: { upserted: number; deleted: number };
  streaks: { upserted: number };
  badges: {
    inserted: number;
    removed: number;
    newlyEarnedCount: number;
  };
  records: { changed: number; checked: number };
}

/**
 * Run the full downstream pipeline after `recomputeClaimAggregates` has
 * landed. The order matters:
 *
 *   1. Monthly snapshots — leaderboard ranks must reflect the new claim set
 *      before Built Different (which reads ranks) is evaluated.
 *   2. Streaks — Iron Streak's threshold depends on Op Machine tiers, but
 *      Op Machine tiers don't change with this step.
 *   3. Badges — reads streaks and snapshots, so it runs after both.
 *   4. Records — reads everything; cheap; always runs in full.
 */
export async function runFullRecompute(
  supabase: SupabaseClient,
  ctx: RecomputeContext,
): Promise<RecomputeSummary> {
  const asOfDate = ctx.asOfDate ?? new Date();

  const snapshots = await recomputeMonthlySnapshots(supabase, ctx.affectedMonths);
  const streaks = await recomputeStreaks(supabase, ctx.affectedConsultants, asOfDate);
  const badges = await recomputeBadges(supabase, ctx.affectedConsultants, ctx.mode, asOfDate);
  const records = await recomputeRecords(supabase);

  return {
    snapshots,
    streaks,
    badges: {
      inserted: badges.inserted,
      removed: badges.removed,
      newlyEarnedCount: badges.newlyEarned.length,
    },
    records,
  };
}

/**
 * Convenience helper: given a set of claim references, derive the affected
 * consultants and year-months from the current `claim_aggregates`. Used by
 * commit and rollback to assemble the recompute context after netting.
 */
export async function gatherAffectedScope(
  supabase: SupabaseClient,
  claimReferences: string[],
): Promise<{ affectedConsultants: string[]; affectedMonths: string[] }> {
  const refs = [...new Set(claimReferences.filter(Boolean))];
  if (refs.length === 0) return { affectedConsultants: [], affectedMonths: [] };

  const consultants = new Set<string>();
  const months = new Set<string>();
  for (let i = 0; i < refs.length; i += 200) {
    const chunk = refs.slice(i, i + 200);
    const { data, error } = await supabase
      .from("claim_aggregates")
      .select(
        "lead_consultant_id, lead_expert_id, tech_writeup_reviewer_id, cost_assessment_reviewer_id, latest_invoice_date",
      )
      .in("claim_reference", chunk);
    if (error) throw new Error(`failed to gather scope: ${error.message}`);
    for (const r of data ?? []) {
      if (r.lead_consultant_id) consultants.add(r.lead_consultant_id);
      if (r.lead_expert_id) consultants.add(r.lead_expert_id);
      if (r.tech_writeup_reviewer_id) consultants.add(r.tech_writeup_reviewer_id);
      if (r.cost_assessment_reviewer_id) consultants.add(r.cost_assessment_reviewer_id);
      if (r.latest_invoice_date) months.add(r.latest_invoice_date.slice(0, 7));
    }
  }
  return {
    affectedConsultants: [...consultants],
    affectedMonths: [...months],
  };
}
