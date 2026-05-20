import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { PIN_COOKIE } from "@/lib/auth/pin-session";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Server-side Supabase client.
 *
 * DEMO MODE: when the PIN session cookie is set we return the service-role
 * client so RLS doesn't block reads (the demo flow has no Supabase Auth
 * user, so auth.uid() is null and every RLS policy would deny). When there's
 * no PIN cookie we fall back to the cookie-bound anon client so the /login
 * page still works pre-auth.
 *
 * This deliberately leaks past RLS — replace before production.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const hasPinCookie = !!cookieStore.get(PIN_COOKIE)?.value;
  if (hasPinCookie) {
    return createSupabaseServiceRoleClient();
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll throws when called from a Server Component. Safe to swallow.
          }
        },
      },
    },
  );
}

/**
 * Server-only client that uses the service role key — bypasses RLS. Used by
 * /api/upload/* and (in demo mode) by every page-side query.
 * NEVER expose this client to the browser.
 */
export function createSupabaseServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
