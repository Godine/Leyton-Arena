import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, Award, Clock, PoundSterling, Trophy, Upload, Users } from "lucide-react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { loadDirectorDashboard } from "@/lib/queries/director";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Director dashboard — Leyton Arena" };

export default async function AdminDashboardPage() {
  const service = createSupabaseServiceRoleClient();
  const data = await loadDirectorDashboard(service);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
            {format(new Date(`${data.currentMonth}-01`), "MMMM yyyy")}
          </p>
          <h1 className="text-section font-medium">Director dashboard</h1>
          <p className="text-body text-muted-foreground">
            {data.lastCommitAt
              ? `Last commit ${formatDistanceToNow(new Date(data.lastCommitAt), { addSuffix: true })}.`
              : "No commits yet."}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/upload" className={buttonVariants({})}>
            <Upload className="h-4 w-4" />
            <span>New upload</span>
          </Link>
          <Link href="/admin/history" className={buttonVariants({ variant: "outline" })}>
            History
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Ops this month"
          value={data.totals.opsThisMonth.toLocaleString()}
          icon={<Award className="h-4 w-4" />}
        />
        <StatCard
          label="Net fees"
          value={`£${Math.round(data.totals.feesThisMonth).toLocaleString()}`}
          icon={<PoundSterling className="h-4 w-4" />}
        />
        <StatCard
          label="Active consultants"
          value={data.totals.activeConsultants.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Avg team cycle"
          value={data.totals.avgCycleDays === null ? "—" : `${data.totals.avgCycleDays} d`}
          icon={<Clock className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Activity since last upload</CardTitle>
              <CardDescription>
                {data.lastCommitAt
                  ? `Since ${format(new Date(data.lastCommitAt), "d MMM, HH:mm")}.`
                  : "Past 7 days."}
              </CardDescription>
            </div>
            <Badge variant="muted">{data.activity.length}</Badge>
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <p className="text-body text-muted-foreground">
                Quiet since the last commit. Drop a new upload to wake the arena.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.activity.slice(0, 12).map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      {a.type === "badge_unlock" ? (
                        <Award className="h-4 w-4 text-primary" />
                      ) : (
                        <Trophy className="h-4 w-4 text-primary" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body">
                        <Link
                          href={`/profile/${a.consultant_id}`}
                          className="text-foreground hover:underline"
                        >
                          {a.title}
                        </Link>
                      </p>
                      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink
              href="/admin/upload"
              label="Run today's upload"
              icon={<Upload className="h-4 w-4" />}
            />
            <QuickLink
              href="/admin/history"
              label="Upload history"
              icon={<Clock className="h-4 w-4" />}
            />
            <QuickLink
              href="/admin/consultants"
              label="Manage consultants"
              icon={<Users className="h-4 w-4" />}
            />
            <QuickLink
              href="/leaderboard"
              label="View leaderboard"
              icon={<Trophy className="h-4 w-4" />}
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <UnderperformingPanel
          title="Technical · bottom 5 this month"
          rows={data.underperforming.technical}
        />
        <UnderperformingPanel
          title="Financial · bottom 5 this month"
          rows={data.underperforming.financial}
        />
      </section>

      <p className="text-eyebrow uppercase tracking-wider text-muted-foreground">
        Underperforming view is director-only — never surfaced to consultants.
      </p>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-2 font-mono text-hero tabular-nums leading-none">{value}</p>
    </div>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-control text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function UnderperformingPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    consultant_id: string;
    display_name: string;
    email: string | null;
    office: string | null;
    ops_count: number;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted-foreground">Not enough data yet this month to rank.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.consultant_id} className="flex items-center gap-3 py-2">
                <Avatar name={r.display_name} email={r.email} size={28} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${r.consultant_id}`}
                    className="text-control hover:underline"
                  >
                    {r.display_name}
                  </Link>
                  <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                    {r.office ?? "Unassigned"}
                  </p>
                </div>
                <span className="font-mono text-control tabular-nums text-muted-foreground">
                  {r.ops_count} ops
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
