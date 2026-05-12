import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Records — Leyton Arena" };

export default function RecordsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Hall of fame</h1>
        <p className="text-body text-muted-foreground">Who holds what — and for how long.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            The records table is already populated. UI ships in Part 4.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
