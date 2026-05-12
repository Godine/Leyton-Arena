import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Leaderboard — Leyton Arena" };

export default function LeaderboardPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Leaderboard</h1>
        <p className="text-body text-muted-foreground">Monthly ranks across the firm.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Ranked by ops_count with net_fees as tiebreaker. The data is already in
            monthly_snapshots — the UI ships in Part 4.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
