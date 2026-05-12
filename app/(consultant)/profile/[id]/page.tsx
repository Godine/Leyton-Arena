import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConsultantRow } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("consultants")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<ConsultantRow>();
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar name={profile.display_name} email={profile.email} size={56} />
        <div className="flex flex-col gap-1">
          <h1 className="text-section font-medium">{profile.display_name}</h1>
          <div className="flex flex-wrap gap-2">
            {profile.has_technical_data ? (
              <Badge variant="muted" className="uppercase">
                technical
              </Badge>
            ) : null}
            {profile.has_financial_data ? (
              <Badge variant="muted" className="uppercase">
                financial
              </Badge>
            ) : null}
            {profile.office ? <Badge variant="outline">{profile.office}</Badge> : null}
            {profile.is_director ? <Badge variant="default">Director</Badge> : null}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Stats, badges, and the share card</CardTitle>
          <CardDescription>
            Ships in Part 4 alongside the leaderboard and badge wall. This page reads from RLS so
            consultants only see what they&apos;re allowed to.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
