import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const requested = (formData?.get("theme") ?? "").toString();
  const next: Theme = requested === "light" ? "light" : "dark";
  cookies().set(THEME_COOKIE, next, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  const redirectTo = (formData?.get("redirect_to") ?? "/").toString();
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
