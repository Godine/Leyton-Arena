"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "@/components/lucide-icon";
import { CATEGORY_LABEL, CATEGORY_ORDER, type BadgeView } from "@/lib/queries/badges";
import { MYTHIC_GRADIENT, TIER_LABEL, tierBorderClass, tierTextClass } from "@/lib/ui/tier";

type Filter = "all" | "earned" | "in_progress" | "mythic";

interface Props {
  views: BadgeView[];
  initialFilter?: Filter;
}

export function BadgesGrid({ views, initialFilter = "all" }: Props) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [focused, setFocused] = useState<BadgeView | null>(null);

  const filtered = useMemo(() => {
    return views.filter((v) => {
      if (filter === "earned") return v.earnedTiers.length > 0;
      if (filter === "in_progress") return v.earnedTiers.length === 0 && v.progressToNext > 0;
      if (filter === "mythic") return v.badge.tiers.some((t) => t.tier === "mythic");
      return true;
    });
  }, [views, filter]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, BadgeView[]>();
    for (const v of filtered) {
      const arr = byCategory.get(v.badge.category) ?? [];
      arr.push(v);
      byCategory.set(v.badge.category, arr);
    }
    return byCategory;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1">
        {(["all", "earned", "in_progress", "mythic"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-control transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {labelFor(f)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-subhead font-medium">Nothing here yet</p>
          <p className="text-body text-muted-foreground">
            Try a different filter — there&apos;s a badge for almost everything.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped.get(cat);
            if (!items || items.length === 0) return null;
            return (
              <section key={cat} className="space-y-3">
                <h2 className="text-eyebrow uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABEL[cat]}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((v) => (
                    <button
                      type="button"
                      key={v.badge.key}
                      onClick={() => setFocused(v)}
                      className={cn(
                        "group flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/40",
                        v.earnedTiers.length === 0 && "opacity-70",
                        v.highestEarned ? tierBorderClass(v.highestEarned) : "border-border",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary",
                            v.highestEarned
                              ? tierTextClass(v.highestEarned)
                              : "text-muted-foreground",
                            v.highestEarned === "mythic" && MYTHIC_GRADIENT,
                          )}
                        >
                          <LucideIcon name={v.badge.icon} className="h-5 w-5" />
                        </span>
                        <div className="flex-1">
                          <p className="text-control font-medium">{v.badge.name}</p>
                          <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                            {v.highestEarned ? TIER_LABEL[v.highestEarned] : "Not earned yet"}
                          </p>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-body text-muted-foreground">
                        {v.badge.description}
                      </p>
                      <div className="mt-auto space-y-1">
                        {v.nextTier ? (
                          <>
                            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="duration-[400ms] h-full bg-primary transition-[width]"
                                style={{
                                  width: `${Math.max(2, Math.round(v.progressToNext * 100))}%`,
                                }}
                              />
                            </div>
                            <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                              {v.progressLabel}
                            </p>
                          </>
                        ) : v.highestEarned ? (
                          <p className="text-eyebrow uppercase tracking-wide text-primary">Maxed</p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {focused ? <BadgeDetail view={focused} onClose={() => setFocused(null)} /> : null}
    </div>
  );
}

function BadgeDetail({ view, onClose }: { view: BadgeView; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "inline-flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary",
              view.highestEarned ? tierTextClass(view.highestEarned) : "text-muted-foreground",
              view.highestEarned === "mythic" && MYTHIC_GRADIENT,
            )}
          >
            <LucideIcon name={view.badge.icon} className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="text-section font-medium">{view.badge.name}</p>
            <p className="text-body text-muted-foreground">{view.badge.description}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-eyebrow uppercase tracking-wider text-muted-foreground">Tiers</p>
          <ul className="space-y-1.5">
            {view.badge.tiers.map((t) => {
              const earned = view.earnedTiers.find((e) => e.tier === t.tier);
              return (
                <li
                  key={t.tier}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={earned ? "default" : "outline"}
                      className={cn("capitalize", earned ? "" : "text-muted-foreground")}
                    >
                      {t.tier}
                    </Badge>
                    <span className="text-control">{t.thresholdLabel}</span>
                  </div>
                  <span className="text-body tabular-nums text-muted-foreground">
                    {earned ? `Earned ${format(new Date(earned.earned_at), "d MMM yyyy")}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {view.progressLabel ? (
          <p className="mt-4 text-body text-muted-foreground">{view.progressLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

function labelFor(f: Filter): string {
  switch (f) {
    case "all":
      return "All badges";
    case "earned":
      return "Earned";
    case "in_progress":
      return "In progress";
    case "mythic":
      return "Mythic only";
  }
}
