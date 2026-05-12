import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName } from "@/lib/parsers/normalize";

interface ConsultantSeed {
  /** Original display-cased name from the export. */
  displayName: string;
  /** Which role(s) the appearance implies. */
  role: "technical" | "financial" | "both";
}

interface NameSeedRow {
  lead_consultant_name: string | null;
  lead_expert_name: string | null;
  tech_writeup_reviewer_name?: string | null;
  cost_assessment_reviewer_name?: string | null;
}

/**
 * Resolve every unique consultant name across the parsed rows to a
 * `consultants.id`. Creates placeholder rows for names that haven't been seen
 * before; existing rows have their `has_*_data` flags updated to reflect new
 * appearances.
 *
 * Returns a Map from normalized_name -> consultant id.
 */
export async function ensureConsultantsForRows(
  supabase: SupabaseClient,
  rows: NameSeedRow[],
): Promise<Map<string, string>> {
  // Gather seeds by normalized name. If a name shows up as both a lead
  // consultant (technical) and a lead expert (financial), record it as both.
  // Reviewers are role-aligned with the workflow they review: tech writeup
  // reviewers are technical, cost assessment reviewers are financial.
  const seeds = new Map<string, ConsultantSeed>();
  const setRole = (name: string | null | undefined, role: "technical" | "financial") => {
    if (!name) return;
    const norm = normalizeName(name);
    if (!norm) return;
    const existing = seeds.get(norm);
    if (!existing) {
      seeds.set(norm, { displayName: name.trim(), role });
    } else if (existing.role !== role && existing.role !== "both") {
      seeds.set(norm, { ...existing, role: "both" });
    }
  };

  for (const r of rows) {
    setRole(r.lead_consultant_name, "technical");
    setRole(r.lead_expert_name, "financial");
    setRole(r.tech_writeup_reviewer_name, "technical");
    setRole(r.cost_assessment_reviewer_name, "financial");
  }

  if (seeds.size === 0) return new Map();

  const norms = [...seeds.keys()];
  const { data: existing, error } = await supabase
    .from("consultants")
    .select("id, normalized_name, primary_role, has_technical_data, has_financial_data")
    .in("normalized_name", norms);

  if (error) throw new Error(`failed to load consultants: ${error.message}`);

  const byNorm = new Map<string, { id: string }>();
  const existingByNorm = new Map<
    string,
    {
      id: string;
      primary_role: "technical" | "financial" | "both";
      has_technical_data: boolean;
      has_financial_data: boolean;
    }
  >();
  for (const row of existing ?? []) {
    existingByNorm.set(row.normalized_name, {
      id: row.id,
      primary_role: row.primary_role,
      has_technical_data: row.has_technical_data,
      has_financial_data: row.has_financial_data,
    });
    byNorm.set(row.normalized_name, { id: row.id });
  }

  // Update existing rows whose role flags should expand.
  const toUpdate: {
    id: string;
    has_technical_data: boolean;
    has_financial_data: boolean;
    primary_role: "technical" | "financial" | "both";
  }[] = [];
  for (const [norm, seed] of seeds) {
    const ex = existingByNorm.get(norm);
    if (!ex) continue;
    const wantsTech = seed.role === "technical" || seed.role === "both";
    const wantsFin = seed.role === "financial" || seed.role === "both";
    const nextTech = ex.has_technical_data || wantsTech;
    const nextFin = ex.has_financial_data || wantsFin;
    const nextPrimary: "technical" | "financial" | "both" =
      nextTech && nextFin ? "both" : nextTech ? "technical" : "financial";

    if (
      nextTech !== ex.has_technical_data ||
      nextFin !== ex.has_financial_data ||
      nextPrimary !== ex.primary_role
    ) {
      toUpdate.push({
        id: ex.id,
        has_technical_data: nextTech,
        has_financial_data: nextFin,
        primary_role: nextPrimary,
      });
    }
  }
  if (toUpdate.length > 0) {
    // upsert by id keeps it a single round trip
    const { error: upErr } = await supabase.from("consultants").upsert(toUpdate, {
      onConflict: "id",
    });
    if (upErr) throw new Error(`failed to update consultants: ${upErr.message}`);
  }

  // Insert placeholders for names we haven't seen before.
  const toInsert: {
    display_name: string;
    normalized_name: string;
    primary_role: "technical" | "financial" | "both";
    has_technical_data: boolean;
    has_financial_data: boolean;
  }[] = [];
  for (const [norm, seed] of seeds) {
    if (existingByNorm.has(norm)) continue;
    const tech = seed.role === "technical" || seed.role === "both";
    const fin = seed.role === "financial" || seed.role === "both";
    toInsert.push({
      display_name: seed.displayName,
      normalized_name: norm,
      primary_role: tech && fin ? "both" : tech ? "technical" : "financial",
      has_technical_data: tech,
      has_financial_data: fin,
    });
  }
  if (toInsert.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("consultants")
      .insert(toInsert)
      .select("id, normalized_name");
    if (insErr) throw new Error(`failed to insert consultants: ${insErr.message}`);
    for (const row of inserted ?? []) {
      byNorm.set(row.normalized_name, { id: row.id });
    }
  }

  const out = new Map<string, string>();
  for (const [norm, { id }] of byNorm) out.set(norm, id);
  return out;
}
