import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { resolveRole } from "@/lib/ui/role";
import { loadBadgesForConsultant } from "@/lib/queries/badges";
import { RoleToggle } from "@/components/consultant/role-toggle";
import { BadgesGrid } from "@/components/consultant/badges-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Badges — Leyton Arena" };

export default async function BadgesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const me = await requireCurrentConsultant();
  const queryRole = typeof searchParams.role === "string" ? searchParams.role : undefined;
  const { role, available } = resolveRole(me, queryRole);

  const supabase = createSupabaseServerClient();
  const views = await loadBadgesForConsultant(supabase, me.id, role);
  const filter =
    typeof searchParams.filter === "string"
      ? (searchParams.filter as "all" | "earned" | "in_progress" | "mythic")
      : "all";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-section font-medium">Badges</h1>
          <RoleToggle current={role} available={available} />
        </div>
      </header>
      <BadgesGrid views={views} initialFilter={filter} />
    </div>
  );
}
