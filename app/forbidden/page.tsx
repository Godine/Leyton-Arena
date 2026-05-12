import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Forbidden — Leyton Arena" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
      <ShieldOff className="h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-section font-medium">Director access only</h1>
      <p className="mt-2 max-w-sm text-body text-muted-foreground">
        This area is reserved for Directors. Ask one to flip your access flag if you think you
        should be in here.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
