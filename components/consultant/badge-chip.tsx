"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideIcon } from "@/components/lucide-icon";
import { MYTHIC_GRADIENT, TIER_LABEL, tierBorderClass, tierTextClass } from "@/lib/ui/tier";
import type { BadgeHighlight } from "@/lib/queries/dashboard";

interface Props {
  highlight: BadgeHighlight;
  fresh?: boolean;
}

export function BadgeChip({ highlight, fresh }: Props) {
  const { badge, earnedTier, nextTier, progressToNext, progressLabel } = highlight;
  const mythic = earnedTier === "mythic";
  return (
    <motion.div
      initial={fresh ? { scale: 0.95, opacity: 0 } : false}
      animate={fresh ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex h-full flex-col gap-2 rounded-lg border bg-card p-3 transition-colors",
        earnedTier ? tierBorderClass(earnedTier) : "border-border",
        fresh && "shadow-[0_0_28px_rgba(242,97,34,0.35)]",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary",
            earnedTier ? tierTextClass(earnedTier) : "text-muted-foreground",
            mythic && MYTHIC_GRADIENT,
          )}
        >
          <LucideIcon name={badge.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-control font-medium leading-tight">{badge.name}</p>
          <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
            {earnedTier ? TIER_LABEL[earnedTier] : "Not earned yet"}
          </p>
        </div>
      </div>
      <p className="line-clamp-2 text-body text-muted-foreground">{badge.description}</p>
      {nextTier ? (
        <div className="mt-auto space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="duration-[400ms] h-full bg-primary transition-[width]"
              style={{ width: `${Math.max(2, Math.round(progressToNext * 100))}%` }}
            />
          </div>
          <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
            {progressLabel ?? `Next: ${TIER_LABEL[nextTier]}`}
          </p>
        </div>
      ) : earnedTier ? (
        <p className="mt-auto text-eyebrow uppercase tracking-wide text-primary">Maxed</p>
      ) : null}
    </motion.div>
  );
}
