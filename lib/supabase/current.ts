import { redirect } from "next/navigation";
import { clearPinSessionCookie, getPinSessionFromCookie } from "@/lib/auth/pin-session";
import { createSupabaseServiceRoleClient } from "./server";
import type { ConsultantRow } from "./database.types";

/**
 * Resolve the currently-signed-in consultant.
 *
 * DEMO MODE: reads the PIN session cookie (set by /login) instead of
 * Supabase Auth. Redirects to /login when there's no session. Clears the
 * cookie and redirects if the cookie references a consultant that's been
 * deleted.
 */
export async function requireCurrentConsultant(): Promise<ConsultantRow> {
  const session = await getPinSessionFromCookie();
  if (!session) redirect("/login");

  const service = createSupabaseServiceRoleClient();
  const { data: consultant } = await service
    .from("consultants")
    .select("*")
    .eq("id", session.consultant_id)
    .maybeSingle<ConsultantRow>();

  if (!consultant) {
    clearPinSessionCookie();
    redirect("/login?error=stale_session");
  }
  return consultant;
}
