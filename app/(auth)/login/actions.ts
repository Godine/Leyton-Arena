"use server";

import { headers } from "next/headers";
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

export async function sendMagicLink(formData: FormData): Promise<SendMagicLinkResult> {
  const parsed = Schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid email.";
    return { ok: false, error: msg };
  }

  const supabase = createSupabaseServerClient();
  const host = headers().get("origin") ?? headers().get("x-forwarded-host") ?? "";
  const origin =
    host.startsWith("http://") || host.startsWith("https://")
      ? host
      : `https://${host || "localhost:3000"}`;

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
