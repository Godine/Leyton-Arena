import type { Role } from "@/lib/types";
import type { ConsultantRow } from "@/lib/supabase/database.types";

/**
 * Resolve the role that should drive the dashboard / leaderboard view for a
 * consultant. URL query param wins (so links remain shareable); otherwise we
 * pick whichever single role they have data in. Dual-role consultants
 * default to technical to match the brief's framing of the "leaderboard
 * pair" (the toggle can flip it).
 */
export function resolveRole(
  consultant: Pick<ConsultantRow, "has_technical_data" | "has_financial_data" | "primary_role">,
  queryRole: string | undefined,
): { role: Role; available: Role[]; canToggle: boolean } {
  const available: Role[] = [];
  if (consultant.has_technical_data) available.push("technical");
  if (consultant.has_financial_data) available.push("financial");
  // Fall back to the primary_role field for consultants with no data yet so
  // empty states still pick a side.
  if (available.length === 0) {
    if (consultant.primary_role === "financial") available.push("financial");
    else available.push("technical");
  }
  const requested = queryRole === "financial" || queryRole === "technical" ? queryRole : null;
  const role = requested && available.includes(requested) ? requested : available[0]!;
  return { role, available, canToggle: available.length > 1 };
}
