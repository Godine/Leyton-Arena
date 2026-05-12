import { format, formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { loadProfile } from "@/lib/queries/profile";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "@/components/lucide-icon";
import { MYTHIC_GRADIENT, TIER_LABEL, tierBorderClass, tierTextClass } from "@/lib/ui/tier";
import { cn } from "@/lib/utils";
import { ShareCardButton } from "@/components/consultant/share-card-button";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { id: string } }) {
  await requireCurrentConsultant();
  const supabase = createSupabaseServerClient();
  const profile = await loadProfile(supabase, params.id);
  if (!profile) notFound();

  const me = profile.consultant;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={me.display_name} email={me.email} size={64} />
          <div className="flex flex-col gap-1">
            <h1 className="text-section font-medium leading-tight">{me.display_name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {me.office ? <Badge variant="outline">{me.office}</Badge> : null}
              {me.has_technical_data ? (
                <Badge variant="muted" className="uppercase">
                  technical
                </Badge>
              ) : null}
              {me.has_financial_data ? (
                <Badge variant="muted" className="uppercase">
                  financial
                </Badge>
              ) : null}
              {me.is_director ? <Badge variant="default">Director</Badge> : null}
            </div>
            <p className="text-body text-muted-foreground">
              Joined {format(new Date(me.joined_at), "MMMM yyyy")}
            </p>
          </div>
        </div>
        <ShareCardButton
          payload={{
            displayName: me.display_name,
            email: me.email,
            office: me.office,
            ranks: profile.ranks,
            lifetimeOps: profile.lifetimeOps,
            lifetimeFees: profile.lifetimeFees,
            bestStreak: profile.bestStreak,
            topBadges: profile.badges.slice(0, 3).map((b) => ({
              key: b.badge.key,
              name: b.badge.name,
              icon: b.badge.icon,
              tier: b.tier,
            })),
          }}
        />
      </header>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <ProfileStat label="Lifetime ops" value={profile.lifetimeOps.toLocaleString()} />
        <ProfileStat
          label="Lifetime fees"
          value={`£${Math.round(profile.lifetimeFees).toLocaleString()}`}
        />
        <ProfileStat label="Best Iron Streak" value={`${profile.bestStreak}`} />
        <ProfileStat label="Records held" value={`${profile.recordsHeld.length}`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.badges.length === 0 ? (
              <p className="text-body text-muted-foreground">
                No badges yet. Their first will be the loudest.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {profile.badges.map((b) => (
                  <li
                    key={`${b.badge.key}-${b.role}-${b.tier}`}
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-card px-3 py-2",
                      tierBorderClass(b.tier),
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary",
                        tierTextClass(b.tier),
                        b.tier === "mythic" && MYTHIC_GRADIENT,
                      )}
                    >
                      <LucideIcon name={b.badge.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-control font-medium">{b.badge.name}</p>
                      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                        {TIER_LABEL[b.tier]} · {b.role} ·{" "}
                        {format(new Date(b.earned_at), "MMM yyyy")}
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
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.activity.length === 0 ? (
              <p className="text-body text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-2 text-body">
                {profile.activity.map((a) => (
                  <li key={a.id} className="flex flex-col">
                    <span className="text-foreground">{activityTitle(a)}</span>
                    <span className="text-eyebrow uppercase tracking-wide text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-section tabular-nums">{value}</p>
    </div>
  );
}

function activityTitle(a: { type: string; payload: Record<string, unknown> }): string {
  if (a.type === "badge_unlock") {
    return `Unlocked ${String(a.payload.badge_name)} ${capitalize(String(a.payload.tier))}`;
  }
  if (a.type === "record_taken") {
    return `Took record — ${String(a.payload.value_label)}`;
  }
  if (a.type === "record_lost") {
    return `Lost record to ${String(a.payload.new_holder_name)}`;
  }
  if (a.type === "streak_milestone") {
    return `Streak milestone — ${String(a.payload.streak_type)}`;
  }
  return a.type;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
