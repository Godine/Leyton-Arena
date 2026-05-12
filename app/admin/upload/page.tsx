import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadFlow } from "@/components/admin/upload-flow";

export const metadata = { title: "Upload — Leyton Arena" };
export const dynamic = "force-dynamic";

export default function AdminUploadPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-section font-medium">Upload</h1>
        <p className="text-body text-muted-foreground">
          Drop today&apos;s invoice export, review the preview, then commit.
        </p>
      </div>

      <UploadFlow />

      <Card>
        <CardHeader>
          <CardTitle>What happens on commit</CardTitle>
          <CardDescription>The pipeline is idempotent end-to-end.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-body text-muted-foreground">
          <p>
            1. Rows insert into <span className="text-foreground">invoice_rows</span> tagged with
            this upload id.
          </p>
          <p>2. Consultant placeholders are created for any new names.</p>
          <p>
            3. Claims affected by the upload are re-netted (
            <span className="text-foreground">claim_aggregates</span>).
          </p>
          <p>4. Snapshots, streaks, badges and records all recompute.</p>
          <p>5. Notifications fire to affected consultants in real time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
