import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Upload history — Leyton Arena" };

export default function AdminHistoryPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Upload history</h1>
        <p className="text-body text-muted-foreground">Every preview, commit, and rollback.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming with Part 4</CardTitle>
          <CardDescription>
            Browse the audit log of every upload here. Wires up in Part 4.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-body text-muted-foreground">
          The data is already accumulating in the `uploads` table.
        </CardContent>
      </Card>
    </div>
  );
}
