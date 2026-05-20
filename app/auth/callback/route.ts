import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Magic-link auth is disabled in demo mode. Anything hitting /auth/callback
 * just gets bounced back to /login so the PIN flow can do its thing.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
