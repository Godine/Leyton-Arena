import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Badges — Leyton Arena" };

export default function BadgesPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Badges</h1>
        <p className="text-body text-muted-foreground">Your earned tiers and what&apos;s next.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>The full 30-badge wall ships in Part 4.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
