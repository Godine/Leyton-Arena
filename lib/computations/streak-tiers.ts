import type { BadgeTier } from "@/lib/types";

/**
 * Op Machine monthly-ops thresholds, copied here to avoid a circular import
 * between `lib/computations/streaks.ts` and `lib/badges/catalog.ts`. These
 * must stay in sync with the OP_MACHINE_TIERS table in the catalog.
 */
export const OP_MACHINE_TIERS_FOR_STREAK: Record<BadgeTier, number> = {
  bronze: 3,
  silver: 5,
  gold: 8,
  platinum: 12,
  diamond: 15,
  mythic: Infinity,
};
