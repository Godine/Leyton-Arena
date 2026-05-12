import { format } from "date-fns";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { loadAllRecords } from "@/lib/queries/records";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RecordsTabs } from "@/components/consultant/records-tabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Records — Leyton Arena" };

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await requireCurrentConsultant();
  const supabase = createSupabaseServerClient();
  const records = await loadAllRecords(supabase, me.id);
  const activeTab =
    typeof searchParams.tab === "string" &&
    ["technical", "financial", "cross_role"].includes(searchParams.tab)
      ? (searchParams.tab as "technical" | "financial" | "cross_role")
      : "technical";

  const filtered = records.filter((r) => {
    if (activeTab === "cross_role") return r.record_key === "largest_single_fee";
    return r.role === activeTab && r.record_key !== "largest_single_fee";
  });

  // Self-held first.
  filtered.sort((a, b) => (a.is_self_held === b.is_self_held ? 0 : a.is_self_held ? -1 : 1));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-section font-medium">Hall of fame</h1>
        <p className="text-body text-muted-foreground">
          Who holds what — and how long they&apos;ve held it.
        </p>
      </header>

      <RecordsTabs active={activeTab} />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-subhead font-medium">No records here yet</p>
          <p className="text-body text-muted-foreground">
            Records populate as the daily upload pipeline runs.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {filtered.map((r) => (
            <li
              key={`${r.record_key}|${r.role}`}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-5",
                r.is_self_held
                  ? "border-primary/60 shadow-[0_0_24px_rgba(242,97,34,0.15)]"
                  : "border-border",
              )}
            >
              <header className="flex items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-md",
                    r.role === "technical"
                      ? "bg-tier-platinum/15 text-tier-platinum"
                      : "bg-tier-diamond/15 text-tier-diamond",
                  )}
                >
                  <Trophy className="h-4 w-4" />
                </span>
                <div className="flex-1">
                  <p className="text-eyebrow uppercase tracking-wider text-muted-foreground">
                    {r.label}
                  </p>
                  <p className="font-mono text-section tabular-nums leading-tight">
                    {r.value_label}
                  </p>
                </div>
                {r.is_self_held ? <Badge variant="default">You</Badge> : null}
              </header>
              <div className="flex items-center gap-3">
                <Avatar name={r.holder_display_name} email={r.holder_email} size={32} />
                <div className="flex-1">
                  <p className="text-control font-medium">
                    {r.holder_id ? (
                      <Link href={`/profile/${r.holder_id}`} className="hover:underline">
                        {r.holder_display_name}
                      </Link>
                    ) : (
                      r.holder_display_name
                    )}
                  </p>
                  <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                    {r.holder_office ?? "Office unknown"} ·{" "}
                    {format(new Date(r.achieved_at), "d MMM yyyy")}
                  </p>
                </div>
              </div>
              {r.previous.length > 0 ? (
                <div className="rounded-md border border-border bg-background/40 p-3">
                  <p className="mb-2 text-eyebrow uppercase tracking-wider text-muted-foreground">
                    Previous holders
                  </p>
                  <ul className="space-y-1">
                    {r.previous.map((p, i) => (
                      <li key={i} className="flex items-center justify-between text-body">
                        <span className="text-muted-foreground">{p.holder_display_name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {p.value_label} · {format(new Date(p.achieved_at), "MMM yyyy")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-body text-muted-foreground">{r.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
