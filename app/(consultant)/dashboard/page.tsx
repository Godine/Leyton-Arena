import Link from "next/link";
import { Activity, Clock, Gauge, PoundSterling } from "lucide-react";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { loadDashboardData } from "@/lib/queries/dashboard";
import { resolveRole } from "@/lib/ui/role";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleToggle } from "@/components/consultant/role-toggle";
import { StatCard } from "@/components/consultant/stat-card";
import { BadgeChip } from "@/components/consultant/badge-chip";
import { LeaderboardPreviewList } from "@/components/consultant/leaderboard-preview-list";
import { TrendSparkline } from "@/components/consultant/trend-sparkline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Leyton Arena" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await requireCurrentConsultant();
  const queryRole = typeof searchParams.role === "string" ? searchParams.role : undefined;
  const { role, available } = resolveRole(me, queryRole);

  const supabase = createSupabaseServerClient();
  const data = await loadDashboardData(supabase, me.id, role, me.last_visited_at);

  // Bump last_visited_at *after* the load so the next visit knows what's new
  // since this one. Fire-and-forget — we don't block render on the write.
  void supabase
    .from("consultants")
    .update({ last_visited_at: new Date().toISOString() })
    .eq("id", me.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <RoleToggle current={role} available={available} />
          <span className="text-eyebrow uppercase tracking-wider text-muted-foreground">
            {format(new Date(`${data.currentMonth}-01`), "MMMM yyyy")}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={me.display_name} email={me.email} size={56} />
            <div className="flex flex-col gap-1">
              <h1 className="text-section font-medium leading-tight">{me.display_name}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {me.office ? <Badge variant="outline">{me.office}</Badge> : null}
                <Badge variant="muted" className="uppercase">
                  {role}
                </Badge>
                {data.stats.ironStreak.current > 0 ? (
                  <span className="text-body text-muted-foreground">
                    Active streak ·{" "}
                    <span className="tabular-nums text-foreground">
                      {data.stats.ironStreak.current}
                    </span>{" "}
                    month{data.stats.ironStreak.current === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {data.rank ? (
            <div className="rounded-lg border border-border bg-card px-5 py-3 text-right">
              <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                Rank this month
              </p>
              <p className="font-mono text-hero tabular-nums leading-tight">
                #{data.rank.position}
                <span className="text-section text-muted-foreground"> / {data.rank.total}</span>
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card px-5 py-3 text-right">
              <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                Rank this month
              </p>
              <p className="text-body text-muted-foreground">No ops yet</p>
            </div>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Gauge className="h-4 w-4" />}
          label="Ops this month"
          value={data.stats.opsThisMonth.toString()}
          hint={data.stats.opsHint}
        />
        <StatCard
          icon={<PoundSterling className="h-4 w-4" />}
          label="Net fees this month"
          value={`£${Math.round(data.stats.netFeesThisMonth).toLocaleString()}`}
          hint={data.stats.feesHint}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={data.stats.avgCycleLabel}
          value={data.stats.avgCycleDays === null ? "—" : `${data.stats.avgCycleDays} d`}
          hint={data.stats.cycleHint}
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Iron Streak"
          value={`${data.stats.ironStreak.current}`}
          hint={data.stats.streakHint}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Active badges &amp; progress</CardTitle>
            <Link
              href="/badges"
              className="text-eyebrow uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {data.highlightedBadges.length === 0 ? (
              <p className="text-body text-muted-foreground">
                No badges yet. Land your first op and they&apos;ll start rolling in.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.highlightedBadges.map((h) => (
                  <li key={h.badge.key}>
                    <BadgeChip
                      highlight={h}
                      fresh={data.freshlyEarnedKeys.includes(
                        `${h.badge.key}|${h.earnedTier ?? ""}`,
                      )}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Leaderboard preview</CardTitle>
            <Link
              href={`/leaderboard?role=${role}`}
              className="text-eyebrow uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              Full board
            </Link>
          </CardHeader>
          <CardContent>
            {data.leaderboardPreview.length === 0 ? (
              <p className="text-body text-muted-foreground">
                No ranked ops this month yet. Be the first on the board.
              </p>
            ) : (
              <LeaderboardPreviewList entries={data.leaderboardPreview} />
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Last 12 months</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendSparkline trend={data.trend} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
