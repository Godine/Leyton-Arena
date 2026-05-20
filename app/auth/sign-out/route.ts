import { NextResponse, type NextRequest } from "next/server";
import { clearPinSessionCookie } from "@/lib/auth/pin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  clearPinSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
