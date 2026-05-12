import { requireCurrentConsultant } from "@/lib/supabase/current";
import { AppShell } from "@/components/consultant/app-shell";

export const dynamic = "force-dynamic";

export default async function ConsultantLayout({ children }: { children: React.ReactNode }) {
  const consultant = await requireCurrentConsultant();
  return (
    <AppShell
      consultant={{
        id: consultant.id,
        display_name: consultant.display_name,
        email: consultant.email,
        is_director: consultant.is_director,
      }}
    >
      {children}
    </AppShell>
  );
}
