/**
 * Domain types used by the computation engine (badges, streaks, snapshots,
 * records). These are the in-memory shapes — see lib/supabase/database.types
 * for the matching DB rows.
 */
import type { BadgeTier, Role } from "@/lib/types";

/**
 * A claim aggregate as the engine consumes it. Mirrors `claim_aggregates`
 * with numeric typing and pre-extracted claim year from the reference.
 */
export interface ClaimAggregate {
  claim_reference: string;
  net_amount: number;
  latest_invoice_date: string; // ISO YYYY-MM-DD
  is_valid_op: boolean;
  row_count: number;
  lead_consultant_id: string | null;
  lead_expert_id: string | null;
  client_display_name: string | null;
  product: string | null;
  year_end_month: string | null; // month name, e.g. "December"
  handover_complete_date: string | null;
  overview_complete_date: string | null;
  scoping_complete_date: string | null;
  tech_writeup_reviewed_date: string | null;
  cost_assessment_reviewed_date: string | null;
  financial_documents_received_date: string | null;
  costs_received_date: string | null;
  pre_notification_required: boolean | null;
  pre_notification_date: string | null;
  tech_writeup_reviewer_id: string | null;
  cost_assessment_reviewer_id: string | null;
  /** Year extracted from the claim reference suffix; null when unparseable. */
  claim_year: number | null;
}

export interface ConsultantLite {
  id: string;
  display_name: string;
  has_technical_data: boolean;
  has_financial_data: boolean;
}

export interface MonthlySnapshotLite {
  consultant_id: string;
  role: Role;
  year_month: string;
  ops_count: number;
  net_fees: number;
  avg_cycle_days: number | null;
  rank: number | null;
  total_consultants: number | null;
}

export interface StreakLite {
  consultant_id: string;
  role: Role;
  streak_type: string;
  current_count: number;
  best_count: number;
  started_at: string | null;
  last_extended_at: string | null;
  is_active: boolean;
}

/**
 * Context passed to a badge evaluator. The engine pre-filters the consultant's
 * claim aggregates to those they own in the given role (lead_consultant for
 * technical, lead_expert for financial). Everything else is supplied so
 * evaluators can stay pure.
 */
export interface BadgeEvaluatorInput {
  consultantId: string;
  role: Role;
  asOfDate: Date;
  /** Claims this consultant owns in this role. Includes invalid (net <= 0). */
  claimAggregates: ClaimAggregate[];
  /** All consultants (lite) — needed for relative-rank badges. */
  allConsultants: ConsultantLite[];
  /** Monthly snapshots for THIS consultant in THIS role. */
  monthlySnapshots: MonthlySnapshotLite[];
  /** Monthly snapshots for every consultant in this role (Built Different). */
  leaderboardSnapshots: MonthlySnapshotLite[];
  /** Streaks belonging to this consultant in this role. */
  streaks: StreakLite[];
  /** Counts of times this consultant appears as the named reviewer. */
  reviewerStats: {
    techWriteupCount: number;
    costAssessmentCount: number;
  };
  /**
   * For Dream Team: counts of valid ops shared with each partner consultant
   * (keyed by the partner's id). Partners are on the *other* side of the
   * lead pairing. Empty for a consultant with no shared ops.
   */
  partnerOpCounts: Map<string, number>;
}

export interface BadgeEvaluation {
  /** Numeric value the evaluator computed — drives the progress bar. */
  currentValue: number;
  /** Tiers earned, in ascending order. */
  earnedTiers: BadgeTier[];
  /** Short human-readable progress string. */
  progressLabel: string;
  /** Free-form audit blob persisted on each badges_earned row. */
  progressData: Record<string, unknown>;
}
