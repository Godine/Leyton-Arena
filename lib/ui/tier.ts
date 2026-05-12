import type { BadgeTier } from "@/lib/types";

export const TIER_HEX: Record<BadgeTier, string> = {
  bronze: "#A97142",
  silver: "#C0C5CC",
  gold: "#E0B040",
  platinum: "#7DD3FC",
  diamond: "#C4A0FF",
  mythic: "#F26122",
};

/**
 * Returns the Tailwind class set for text in the tier colour. We avoid arbitrary
 * `text-[#hex]` values because Tailwind's JIT won't always emit them when the
 * tier is loaded dynamically.
 */
export function tierTextClass(tier: string): string {
  switch (tier) {
    case "bronze":
      return "text-tier-bronze";
    case "silver":
      return "text-tier-silver";
    case "gold":
      return "text-tier-gold";
    case "platinum":
      return "text-tier-platinum";
    case "diamond":
      return "text-tier-diamond";
    case "mythic":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
}

export function tierBorderClass(tier: string): string {
  switch (tier) {
    case "bronze":
      return "border-tier-bronze";
    case "silver":
      return "border-tier-silver";
    case "gold":
      return "border-tier-gold";
    case "platinum":
      return "border-tier-platinum";
    case "diamond":
      return "border-tier-diamond";
    case "mythic":
      return "border-primary";
    default:
      return "border-border";
  }
}

/**
 * Mythic gets a holographic gradient background — the only place in the UI
 * where a gradient is permitted per the brief.
 */
export const MYTHIC_GRADIENT =
  "bg-[conic-gradient(at_30%_30%,_#F26122_0deg,_#C4A0FF_120deg,_#7DD3FC_240deg,_#F26122_360deg)]";

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
  mythic: "Mythic",
};
