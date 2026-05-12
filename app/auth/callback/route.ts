import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Magic-link callback. Supabase Auth redirects here with a `code` query
 * param; we exchange it for a session (which sets the auth cookies via the
 * SSR helper) and bounce to `next` (or /dashboard by default).
 *
 * If the email isn't linked to a `consultants` row yet — either because the
 * Director hasn't assigned it, or because the trigger missed — we send the
 * user to /login with a friendly error rather than dropping them on a
 * dashboard with no data.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // Confirm we have a linked consultants row. The auth.users insert trigger
  // does the email match; if it didn't fire (e.g. existing user signing in
  // before email was assigned), surface a clearer message.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: consultant } = await supabase
      .from("consultants")
      .select("id, is_director")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!consultant) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not_linked", request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
