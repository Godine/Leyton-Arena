import { SignJWT, jwtVerify } from "jose";
import type { PreviewTokenClaims } from "@/lib/types";

const ALG = "HS256";
const ISSUER = "leyton-arena";
const AUDIENCE = "upload-preview";

function getSecret() {
  const raw = process.env.UPLOAD_PREVIEW_SECRET;
  if (!raw) {
    throw new Error("UPLOAD_PREVIEW_SECRET is not configured");
  }
  return new TextEncoder().encode(raw);
}

export async function signPreviewToken(
  payload: Omit<PreviewTokenClaims, "iat" | "exp">,
  ttlSeconds = 60 * 60 * 24,
): Promise<string> {
  return new SignJWT({
    filename: payload.filename,
    fileSizeBytes: payload.fileSizeBytes,
    rowCount: payload.rowCount,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getSecret());
}

export async function verifyPreviewToken(token: string): Promise<PreviewTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!payload.sub) throw new Error("preview token missing sub");
  return {
    sub: payload.sub,
    iat: payload.iat ?? 0,
    exp: payload.exp ?? 0,
    filename: String(payload.filename ?? ""),
    fileSizeBytes: Number(payload.fileSizeBytes ?? 0),
    rowCount: Number(payload.rowCount ?? 0),
  };
}
