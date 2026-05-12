import { NextResponse } from "next/server";
import { requireDirector } from "@/lib/supabase/guards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { gatherAffectedScope, runFullRecompute } from "@/lib/computations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual badge / streak / record recompute. Walks every claim aggregate to
 * derive the full set of affected consultants and months, then runs the
 * downstream pipeline. Useful after a hand-edit to consultants or after the
 * badge catalog changes.
 */
export async function POST() {
  const auth = await requireDirector();
  if (!auth.ok) return auth.response;

  const service = createSupabaseServiceRoleClient();

  // Walk all claim refs in paged batches so the scope-gather query keeps
  // memory bounded on large tenants.
  const PAGE = 1000;
  const allRefs: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await service
      .from("claim_aggregates")
      .select("claim_reference")
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "failed_to_list_claims", detail: error.message },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) break;
    for (const r of data) allRefs.push(r.claim_reference);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const scope = await gatherAffectedScope(service, allRefs);
  const recompute = await runFullRecompute(service, {
    affectedClaims: allRefs,
    affectedConsultants: scope.affectedConsultants,
    affectedMonths: scope.affectedMonths,
    mode: "commit",
  });

  return NextResponse.json({ ok: true, recompute });
}
