import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConsultantRow } from "@/lib/supabase/database.types";

export type DirectorAuth =
  | { ok: true; consultant: ConsultantRow }
  | { ok: false; response: NextResponse };

/**
 * Guards an API route to Directors only. Returns either the matched
 * consultant row, or a NextResponse the caller should return directly.
 *
 *   const auth = await requireDirector();
 *   if (!auth.ok) return auth.response;
 *   // ...auth.consultant is safe to use
 */
export async function requireDirector(): Promise<DirectorAuth> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }

  const { data: consultant, error: cErr } = await supabase
    .from("consultants")
    .select("*")
    .eq("id", user.id)
    .single<ConsultantRow>();

  if (cErr || !consultant) {
    return {
      ok: false,
      response: NextResponse.json({ error: "consultant_not_found" }, { status: 403 }),
    };
  }

  if (!consultant.is_director) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, consultant };
}
