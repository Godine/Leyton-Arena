"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please use a valid email address.")
    // Force Leyton-issued addresses. Adjust if the firm onboards other domains.
    .refine(
      (e) => e.endsWith("@leyton.com") || e.endsWith("@leyton.co.uk") || e.endsWith("@leyton.ma"),
      { message: "Use your Leyton work email." },
    ),
});

export type SendMagicLinkResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Build the canonical site origin. Reads from NEXT_PUBLIC_SITE_URL — set this
 * in Vercel to your production URL (e.g.
 * https://leyton-arena-godine-6161s-projects.vercel.app, no trailing slash)
 * and in .env.local to http://localhost:3000. Throws at request time if the
 * env var is missing so the misconfiguration is loud.
 */
function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) throw new Error("NEXT_PUBLIC_SITE_URL is not configured");
  return raw.replace(/\/+$/, ""); // strip any trailing slashes defensively
}

export async function sendMagicLink(formData: FormData): Promise<SendMagicLinkResult> {
  const parsed = Schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid email.";
    return { ok: false, error: msg };
  }

  const supabase = createSupabaseServerClient();
  const origin = getSiteOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, email: parsed.data.email };
}
