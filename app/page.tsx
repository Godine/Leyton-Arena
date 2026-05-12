import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <div className="text-center">
        <p className="text-eyebrow uppercase text-muted-foreground">Leyton</p>
        <h1 className="mt-2 text-hero font-medium">Arena</h1>
        <p className="mt-3 max-w-md text-balance text-muted-foreground">
          Climb the leaderboard. Collect badges. Bank the ops.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-primary px-4 py-2 text-control font-medium text-primary-foreground hover:opacity-90"
        >
          Enter Arena
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-border px-4 py-2 text-control font-medium hover:bg-secondary"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
