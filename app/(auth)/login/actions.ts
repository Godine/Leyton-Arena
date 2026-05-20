"use server";

import { z } from "zod";
import {
  CONSULTANT_PIN,
  DIRECTOR_PIN,
  setPinSessionCookie,
  type PinRole,
} from "@/lib/auth/pin-session";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const Schema = z.object({
  role: z.enum(["director", "consultant"]),
  pin: z.string().regex(/^\d{4}$/, "Enter the 4-digit PIN."),
});

export type SubmitPinResult = { ok: true; role: PinRole } | { ok: false; error: string };

/**
 * DEMO-MODE: validate the PIN, pick a consultant to impersonate, and set the
 * session cookie.
 *
 *   Director PIN  → first consultant with is_director = true
 *   Consultant PIN → first non-director consultant
 *
 * If the consultants table is empty we surface an explicit error so the
 * caller knows to seed it (run a daily upload first).
 */
export async function submitPin(input: { role: PinRole; pin: string }): Promise<SubmitPinResult> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { role, pin } = parsed.data;

  const expected = role === "director" ? DIRECTOR_PIN : CONSULTANT_PIN;
  if (pin !== expected) return { ok: false, error: "Wrong PIN." };

  const consultantId = await pickConsultantForRole(role);
  if (!consultantId) {
    return {
      ok: false,
      error: "No consultants in the database yet. Run a daily upload first.",
    };
  }

  await setPinSessionCookie({ consultant_id: consultantId, role });
  return { ok: true, role };
}

async function pickConsultantForRole(role: PinRole): Promise<string | null> {
  const service = createSupabaseServiceRoleClient();

  if (role === "director") {
    const { data } = await service
      .from("consultants")
      .select("id")
      .eq("is_director", true)
      .order("display_name", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (data?.id) return data.id;
    // No directors yet — fall through and just use the first consultant. The
    // user can flip the is_director flag from /admin/consultants once in.
  } else {
    const { data } = await service
      .from("consultants")
      .select("id")
      .eq("is_director", false)
      .order("display_name", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (data?.id) return data.id;
  }

  const { data: anyRow } = await service
    .from("consultants")
    .select("id")
    .order("display_name", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  return anyRow?.id ?? null;
}
