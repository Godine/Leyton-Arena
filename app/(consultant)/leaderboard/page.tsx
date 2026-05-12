import Link from "next/link";
import { Trophy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { resolveRole } from "@/lib/ui/role";
import {
  loadLeaderboardData,
  loadRecordsStrip,
  type LeaderboardPeriod,
} from "@/lib/queries/leaderboard";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RoleToggle } from "@/components/consultant/role-toggle";
import { LeaderboardTable } from "@/components/consultant/leaderboard-table";
import { LeaderboardFilters } from "@/components/consultant/leaderboard-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard — Leyton Arena" };

const PERIODS: LeaderboardPeriod[] = ["this_month", "last_month", "last_90_days", "all_time"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await requireCurrentConsultant();
  const queryRole = typeof searchParams.role === "string" ? searchParams.role : undefined;
  const { role, available } = resolveRole(me, queryRole);

  const period =
    typeof searchParams.period === "string" &&
    PERIODS.includes(searchParams.period as LeaderboardPeriod)
      ? (searchParams.period as LeaderboardPeriod)
      : "this_month";
  const office =
    typeof searchParams.office === "string" && searchParams.office !== ""
      ? searchParams.office
      : null;
  const search = typeof searchParams.q === "string" ? searchParams.q : null;

  const supabase = createSupabaseServerClient();
  const [board, records] = await Promise.all([
    loadLeaderboardData(supabase, me.id, role, period, { office, search }),
    loadRecordsStrip(supabase, role),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-section font-medium">Leaderboard</h1>
          <RoleToggle current={role} available={available} />
        </div>
        <p className="text-body text-muted-foreground">
          Ranked by ops, with net fees as the tiebreaker.
        </p>
      </header>

      {records.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {records.map((r) => (
            <Link
              key={r.record_key}
              href="/records"
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                  {r.label}
                </p>
                <p className="truncate text-control font-medium">{r.value_label}</p>
                <p className="truncate text-body text-muted-foreground">{r.holder_display_name}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <LeaderboardFilters period={period} office={office} search={search ?? ""} />

      <Card>
        <CardContent className="p-0">
          {board.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
              <p className="text-subhead font-medium">No ranked ops here yet</p>
              <p className="text-body text-muted-foreground">
                Try a different period or office filter.
              </p>
            </div>
          ) : (
            <LeaderboardTable rows={board.rows} />
          )}
        </CardContent>
      </Card>

      {board.yourRowIndex >= 0 && board.rows.length > 5 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 z-10 hidden px-4 lg:bottom-4 lg:flex lg:justify-center">
          <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-lg border border-primary/40 bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
            <span className="font-mono text-control tabular-nums text-muted-foreground">
              #{board.rows[board.yourRowIndex]!.rank}
            </span>
            <Avatar
              name={board.rows[board.yourRowIndex]!.display_name}
              email={board.rows[board.yourRowIndex]!.email}
              size={28}
            />
            <span className="flex-1 truncate text-control">
              {board.rows[board.yourRowIndex]!.display_name}
            </span>
            <Badge variant="default">You</Badge>
            <span className="font-mono text-control tabular-nums">
              {board.rows[board.yourRowIndex]!.ops_count} ops
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
