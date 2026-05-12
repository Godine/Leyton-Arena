import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Paths that don't require authentication. Everything else under the app
 * root is gated; /admin/* additionally requires `is_director`.
 */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth/callback",
  "/auth/sign-out",
  "/forbidden",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  // The upload pipeline routes are authenticated, but they enforce their
  // own director-only guard inline and return 401/403 JSON — let them through
  // here so the response stays an API-shaped JSON rather than a redirect.
  if (pathname.startsWith("/api/")) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Refresh the Supabase auth cookie on every request, then gate routes based
 * on session state. Returns the response Next.js should send.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAdminPath(pathname)) {
    // Look up the consultant row attached to this auth user to check the
    // director flag. We use the user-bound client so RLS applies; consultants
    // can always read their own row.
    const { data: consultant } = await supabase
      .from("consultants")
      .select("is_director")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!consultant || !consultant.is_director) {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      // Use rewrite (not redirect) so the user sees the friendly 403 page
      // at the same URL they tried to hit.
      return NextResponse.rewrite(url, { status: 403 });
    }
  }

  return response;
}
