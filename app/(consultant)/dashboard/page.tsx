import { requireCurrentConsultant } from "@/lib/supabase/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await requireCurrentConsultant();
  const roles: Array<"technical" | "financial"> = [];
  if (me.has_technical_data) roles.push("technical");
  if (me.has_financial_data) roles.push("financial");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">Welcome back</p>
        <h1 className="text-section font-medium">{me.display_name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {roles.map((r) => (
            <Badge key={r} variant="muted" className="uppercase">
              {r}
            </Badge>
          ))}
          {me.office ? <Badge variant="outline">{me.office}</Badge> : null}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Your arena is being built</CardTitle>
          <CardDescription>
            The dashboard, leaderboards, badges, and records ship next. For now, sign-in works and
            your consultant record is linked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-body text-muted-foreground">
          <p>
            Roles detected from upload data:{" "}
            {roles.length === 0 ? (
              <span className="text-foreground">none yet</span>
            ) : (
              roles.join(", ")
            )}
            .
          </p>
          {me.is_director ? (
            <p>
              You&apos;re a Director — head to{" "}
              <span className="text-foreground">/admin/upload</span> to ingest the next daily
              report.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
