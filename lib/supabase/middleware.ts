import { NextResponse, type NextRequest } from "next/server";
import { PIN_COOKIE, verifyPinJwt } from "@/lib/auth/pin-session";

const PUBLIC_PATHS = ["/", "/login", "/auth/sign-out", "/forbidden", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * DEMO MODE: gate routes based on the PIN session cookie set by /login.
 * Also forwards x-pathname so RSC layouts know the active route.
 */
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const pathname = request.nextUrl.pathname;
  const jwt = request.cookies.get(PIN_COOKIE)?.value;
  const session = jwt ? await verifyPinJwt(jwt) : null;

  if (!session && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isAdminPath(pathname) && session.role !== "director") {
    const url = request.nextUrl.clone();
    url.pathname = "/forbidden";
    return NextResponse.rewrite(url, { status: 403 });
  }

  return response;
}
