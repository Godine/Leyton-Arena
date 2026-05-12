import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Upload — Leyton Arena" };

export default function AdminUploadPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Upload</h1>
        <p className="text-body text-muted-foreground">
          Daily Excel ingestion — preview, commit, rollback.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming with Part 4</CardTitle>
          <CardDescription>
            The drag-and-drop preview UI ships in Part 4. The /api/upload/preview, commit, and
            rollback endpoints are already live — see scripts/smoke-recompute.ts.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-body text-muted-foreground">
          For now you can hit the endpoints directly from a tool of your choice.
        </CardContent>
      </Card>
    </div>
  );
}
