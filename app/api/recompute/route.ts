import { NextResponse } from "next/server";
import { requireDirector } from "@/lib/supabase/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual badge / streak / record recompute trigger.
 *
 * Implemented in Part 2 — this stub exists so the route is reserved and so
 * the upload/commit pipeline can call it once the downstream computations
 * land without changing the public surface.
 */
export async function POST() {
  const auth = await requireDirector();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    {
      error: "not_implemented",
      detail: "Badge, streak, and record computations are implemented in Part 2 of the build.",
    },
    { status: 501 },
  );
}
