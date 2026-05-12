"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDirector } from "@/lib/supabase/guards";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const OFFICES = ["London", "Casablanca", "Dublin", "Other"] as const;
const PRIMARY_ROLES = ["technical", "financial", "both"] as const;

const PatchSchema = z.object({
  id: z.string().uuid(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email")
    .nullable()
    .or(z.literal("").transform(() => null)),
  office: z.enum(OFFICES).nullable().optional(),
  primary_role: z.enum(PRIMARY_ROLES).optional(),
  is_director: z.boolean().optional(),
});

export type PatchConsultantResult = { ok: true } | { ok: false; error: string };

/**
 * Inline-edit handler used by the admin consultants table. The director
 * guard runs first; on success we revalidate the page so RSC re-fetches the
 * updated row. The service-role client bypasses RLS so directors can patch
 * `auth_user_id` linkages they otherwise couldn't write.
 */
export async function patchConsultant(input: {
  id: string;
  field: "email" | "office" | "primary_role" | "is_director";
  value: string | boolean | null;
}): Promise<PatchConsultantResult> {
  const auth = await requireDirector();
  if (!auth.ok) return { ok: false, error: "forbidden" };

  const partial: Record<string, unknown> = { id: input.id };
  if (input.field === "email") partial.email = input.value;
  if (input.field === "office") partial.office = input.value;
  if (input.field === "primary_role") partial.primary_role = input.value;
  if (input.field === "is_director") partial.is_director = !!input.value;

  const parsed = PatchSchema.partial({
    email: true,
    office: true,
    primary_role: true,
    is_director: true,
  })
    .extend({ id: z.string().uuid() })
    .safeParse(partial);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  }

  const service = createSupabaseServiceRoleClient();
  const update: Record<string, unknown> = {};
  if ("email" in parsed.data) update.email = parsed.data.email ?? null;
  if ("office" in parsed.data && parsed.data.office !== undefined)
    update.office = parsed.data.office;
  if ("primary_role" in parsed.data && parsed.data.primary_role !== undefined) {
    update.primary_role = parsed.data.primary_role;
  }
  if ("is_director" in parsed.data && parsed.data.is_director !== undefined) {
    update.is_director = parsed.data.is_director;
  }

  if (Object.keys(update).length === 0) return { ok: true };

  // If the email is being set, also try to attach to an existing auth.users
  // row eagerly (covers the case where the user signed in BEFORE the
  // director assigned the email — the trigger only fires on insert).
  if ("email" in update && update.email) {
    const { data: existingUser } = await service.auth.admin.listUsers();
    const match = existingUser?.users?.find(
      (u) => u.email?.toLowerCase() === String(update.email).toLowerCase(),
    );
    if (match) update.auth_user_id = match.id;
  }
  // Setting email to null clears the auth link too — directors can intentionally
  // de-claim a row.
  if ("email" in update && update.email === null) update.auth_user_id = null;

  const { error } = await service.from("consultants").update(update).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/consultants");
  return { ok: true };
}
