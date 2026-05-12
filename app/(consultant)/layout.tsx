import { headers } from "next/headers";
import { AppShell } from "@/components/consultant/app-shell";
import { requireCurrentConsultant } from "@/lib/supabase/current";
import { getThemeFromCookie } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  const consultant = await requireCurrentConsultant();
  const pathname = headers().get("x-pathname") ?? "/dashboard";
  const theme = getThemeFromCookie();

  return (
    <AppShell consultant={consultant} pathname={pathname} theme={theme}>
      {children}
    </AppShell>
  );
}
