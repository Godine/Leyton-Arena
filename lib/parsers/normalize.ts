/**
 * Display-to-matching transforms for consultant names. Centralised here so the
 * Excel parser, the netting layer, and the admin consultants page all agree on
 * what "the same person" means.
 */
export function normalizeName(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Collapse internal whitespace and lowercase. Diacritics are preserved —
  // the source-of-truth in Odoo uses unicode names, and dropping accents
  // would risk collisions between distinct people.
  return trimmed.replace(/\s+/g, " ").toLowerCase();
}

export function nonEmpty(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  return trimmed === "" ? null : trimmed;
}
