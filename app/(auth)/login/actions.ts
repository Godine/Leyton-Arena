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

  const result = await pickConsultantForRole(role);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await setPinSessionCookie({ consultant_id: result.consultant_id, role });
  return { ok: true, role };
}

interface PickResult {
  ok: true;
  consultant_id: string;
}
interface PickError {
  ok: false;
  error: string;
}

async function pickConsultantForRole(role: PinRole): Promise<PickResult | PickError> {
  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch (e) {
    return {
      ok: false,
      error: `Supabase service-role client failed to init: ${(e as Error).message}. Check SUPABASE_SERVICE_ROLE_KEY in Vercel.`,
    };
  }

  if (role === "director") {
    const { data, error } = await service
      .from("consultants")
      .select("id")
      .eq("is_director", true)
      .order("display_name", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      return { ok: false, error: `Director lookup failed: ${error.message}` };
    }
    if (data?.id) return { ok: true, consultant_id: data.id };
    // No directors yet — fall through and just use the first consultant.
  } else {
    const { data, error } = await service
      .from("consultants")
      .select("id")
      .eq("is_director", false)
      .order("display_name", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (error) {
      return { ok: false, error: `Consultant lookup failed: ${error.message}` };
    }
    if (data?.id) return { ok: true, consultant_id: data.id };
  }

  const { data: anyRow, error: anyErr } = await service
    .from("consultants")
    .select("id")
    .order("display_name", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (anyErr) {
    return { ok: false, error: `Fallback lookup failed: ${anyErr.message}` };
  }
  if (anyRow?.id) return { ok: true, consultant_id: anyRow.id };

  return {
    ok: false,
    error:
      "Zero rows in the consultants table. Paste supabase/seeds/demo.sql into the Supabase SQL editor first (and confirm it ran on the right project — the URL in your Supabase dashboard must match NEXT_PUBLIC_SUPABASE_URL in Vercel).",
  };
}
