import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role, BadgeTier } from "@/lib/types";

interface NotificationInsert {
  consultant_id: string;
  type: "badge_unlock" | "streak_milestone" | "record_taken" | "record_lost";
  payload: Record<string, unknown>;
}

/**
 * Persist a batch of notifications. Caller assembles the rows; this helper
 * just chunks and writes. Realtime delivers them to the bell + Sonner toast
 * via the supabase_realtime publication.
 */
export async function emitNotifications(
  supabase: SupabaseClient,
  rows: NotificationInsert[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("notifications").insert(chunk);
    if (error) throw new Error(`failed to insert notifications: ${error.message}`);
    inserted += chunk.length;
  }
  return { inserted };
}

export function badgeUnlockNotification(args: {
  consultant_id: string;
  badge_key: string;
  badge_name: string;
  badge_icon: string;
  role: Role;
  tier: BadgeTier;
  progressLabel?: string;
}): NotificationInsert {
  return {
    consultant_id: args.consultant_id,
    type: "badge_unlock",
    payload: {
      badge_key: args.badge_key,
      badge_name: args.badge_name,
      badge_icon: args.badge_icon,
      role: args.role,
      tier: args.tier,
      progress_label: args.progressLabel ?? null,
    },
  };
}

export function recordTakenNotification(args: {
  /** The consultant who just took the record. */
  consultant_id: string;
  record_key: string;
  role: Role;
  value_label: string;
  /** Previous holder, when there was one. */
  previous_holder_name: string | null;
}): NotificationInsert {
  return {
    consultant_id: args.consultant_id,
    type: "record_taken",
    payload: {
      record_key: args.record_key,
      role: args.role,
      value_label: args.value_label,
      previous_holder_name: args.previous_holder_name,
    },
  };
}

export function recordLostNotification(args: {
  /** The previous holder who just lost the record. */
  consultant_id: string;
  record_key: string;
  role: Role;
  new_holder_name: string;
  new_value_label: string;
}): NotificationInsert {
  return {
    consultant_id: args.consultant_id,
    type: "record_lost",
    payload: {
      record_key: args.record_key,
      role: args.role,
      new_holder_name: args.new_holder_name,
      new_value_label: args.new_value_label,
    },
  };
}
