/**
 * DEMO-MODE PIN auth.
 *
 * THIS IS NOT A REAL AUTH SYSTEM. It exists so we can exercise the UI
 * without going through magic-link sign-in. The PIN values are hardcoded;
 * anyone with the PIN gets full access. Replace with real Supabase Auth
 * before this app ever sees production data.
 *
 * The session is a short JWT signed with UPLOAD_PREVIEW_SECRET so the
 * cookie can't be trivially edited by hand.
 */
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const PIN_COOKIE = "arena_pin_session";
export const SESSION_TTL_DAYS = 30;

export type PinRole = "director" | "consultant";

export interface PinSession {
  consultant_id: string;
  role: PinRole;
}

function getSecret() {
  const raw = process.env.UPLOAD_PREVIEW_SECRET;
  if (!raw) throw new Error("UPLOAD_PREVIEW_SECRET is not configured");
  return new TextEncoder().encode(raw);
}

export async function signPinSession(session: PinSession): Promise<string> {
  return new SignJWT({ consultant_id: session.consultant_id, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getSecret());
}

export async function verifyPinJwt(jwt: string): Promise<PinSession | null> {
  try {
    const { payload } = await jwtVerify(jwt, getSecret());
    if (typeof payload.consultant_id !== "string") return null;
    if (payload.role !== "director" && payload.role !== "consultant") return null;
    return { consultant_id: payload.consultant_id, role: payload.role };
  } catch {
    return null;
  }
}

export async function setPinSessionCookie(session: PinSession): Promise<void> {
  const jwt = await signPinSession(session);
  cookies().set(PIN_COOKIE, jwt, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function getPinSessionFromCookie(): Promise<PinSession | null> {
  const raw = cookies().get(PIN_COOKIE)?.value;
  if (!raw) return null;
  return verifyPinJwt(raw);
}

export function clearPinSessionCookie(): void {
  cookies().delete(PIN_COOKIE);
}

/** Hardcoded PINs. Demo mode only. */
export const DIRECTOR_PIN = "6789";
export const CONSULTANT_PIN = "1234";
