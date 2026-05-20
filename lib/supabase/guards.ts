import { NextResponse } from "next/server";
import { getPinSessionFromCookie } from "@/lib/auth/pin-session";
import { createSupabaseServiceRoleClient } from "./server";
import type { ConsultantRow } from "./database.types";

export type DirectorAuth =
  | { ok: true; consultant: ConsultantRow }
  | { ok: false; response: NextResponse };

/**
 * Guards an API route to Directors only.
 *
 * DEMO MODE: validates the PIN session cookie and confirms the role flag.
 */
export async function requireDirector(): Promise<DirectorAuth> {
  const session = await getPinSessionFromCookie();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  if (session.role !== "director") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: consultant, error } = await service
    .from("consultants")
    .select("*")
    .eq("id", session.consultant_id)
    .maybeSingle<ConsultantRow>();

  if (error || !consultant) {
    return {
      ok: false,
      response: NextResponse.json({ error: "consultant_not_found" }, { status: 403 }),
    };
  }
  return { ok: true, consultant };
}
