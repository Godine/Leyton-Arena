import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./server";
import type { ConsultantRow } from "./database.types";

/**
 * Resolve the currently-signed-in consultant. Redirects to /login when
 * unauthenticated and signs out when an auth user has no linked consultant
 * (the user can re-authenticate after a director fixes the link).
 */
export async function requireCurrentConsultant(): Promise<ConsultantRow> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: consultant } = await supabase
    .from("consultants")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle<ConsultantRow>();

  if (!consultant) {
    await supabase.auth.signOut();
    redirect("/login?error=not_linked");
  }
  return consultant;
}
