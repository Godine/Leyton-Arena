/**
 * Smoke test: parse the sample Excel file and print parse / netting outcomes.
 *
 *   npx tsx scripts/smoke-parse.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseInvoiceExport, summarizeParseResult } from "../lib/parsers/excel";
import { normalizeName } from "../lib/parsers/normalize";

const samplePath = path.join(
  process.cwd(),
  "FX invoices Report (account.invoice.fx.report) (29).xlsx",
);
const buf = fs.readFileSync(samplePath);
const result = parseInvoiceExport(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
);

console.log("== parse ==");
console.log("rows parsed :", result.rows.length);
console.log("errors      :", result.errors.length);
console.log("missing hdrs:", result.missingHeaders);
if (result.errors.length > 0) console.log("first error :", result.errors[0]);

// Pure-JS netting simulation against the parsed rows. Mirrors the logic in
// lib/computations/netting.ts so we can sanity-check expected outcomes.
const byClaim = new Map<string, typeof result.rows>();
for (const r of result.rows) {
  const bucket = byClaim.get(r.claim_reference) ?? [];
  bucket.push(r);
  byClaim.set(r.claim_reference, bucket);
}

let invalid = 0;
let valid = 0;
const invalidDetails: { claim: string; rows: number; net: number }[] = [];
for (const [claim, rows] of byClaim) {
  const net = Math.round(rows.reduce((s, r) => s + (r.amount_due_excl_tax ?? 0), 0) * 100) / 100;
  const isValid = net > 0;
  if (isValid) valid++;
  else {
    invalid++;
    invalidDetails.push({ claim, rows: rows.length, net });
  }
}

console.log("\n== netting ==");
console.log("unique claims :", byClaim.size);
console.log("valid ops     :", valid);
console.log("invalid ops   :", invalid);
console.log("invalid claims:");
for (const d of invalidDetails) console.log(`  ${d.claim} (rows=${d.rows}, net=${d.net})`);

const summary = summarizeParseResult(result, 3);
console.log("\n== summary ==");
console.log(JSON.stringify({ ...summary, sampleRows: undefined }, null, 2));

const consultants = new Set<string>();
for (const r of result.rows) {
  if (r.lead_consultant_name) consultants.add(normalizeName(r.lead_consultant_name)!);
  if (r.lead_expert_name) consultants.add(normalizeName(r.lead_expert_name)!);
}
console.log("\nunique consultants (by normalized name):", consultants.size);
