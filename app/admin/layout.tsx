import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { getThemeFromCookie } from "@/lib/theme";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCurrentConsultant();
  // Middleware already gates this, but the layout double-checks so that
  // direct render paths (e.g. RSC streaming) can't bypass the rule.
  if (!me.is_director) redirect("/forbidden");
  const pathname = headers().get("x-pathname") ?? "/admin";
  const theme = getThemeFromCookie();
  return (
    <AdminShell pathname={pathname} theme={theme} director={{ display_name: me.display_name }}>
      {children}
    </AdminShell>
  );
}
