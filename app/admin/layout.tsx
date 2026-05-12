import { requireCurrentConsultant } from "@/lib/supabase/current";
import { AdminShell } from "@/components/admin/admin-shell";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCurrentConsultant();
  // Middleware already gates this, but the layout double-checks so that
  // direct render paths (e.g. RSC streaming) can't bypass the rule.
  if (!me.is_director) redirect("/forbidden");
  return <AdminShell director={{ display_name: me.display_name }}>{children}</AdminShell>;
}
