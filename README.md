# Leyton Arena

A gamified leaderboard and badge system for Leyton's R&D tax consulting team.

This repo is implemented in five parts (see `BUILD.md`). This commit lands
**Part 1 — project setup, database, and ingestion pipeline**.

## What works after Part 1

- Next.js 14 (App Router) project with TypeScript strict mode, Tailwind +
  shadcn/ui, Geist fonts, dark-mode-first theming, ESLint + Prettier +
  Husky/lint-staged pre-commit hook.
- Supabase schema (`supabase/migrations/0001_initial.sql`) covering
  `consultants`, `uploads`, `invoice_rows`, `claim_aggregates`,
  `badges_earned`, `streaks`, `records`, `monthly_snapshots`, plus RLS
  policies for consultant-self and director-all access.
- Excel parser (`lib/parsers/excel.ts`) that maps the 24 columns of the Odoo
  `account.invoice.fx.report` export to typed rows, with Zod validation and
  per-row error surfacing.
- Claim netting (`lib/computations/netting.ts`) that aggregates rows by
  `claim_reference`, uses `amount_due_excl_tax` (the credit-note-aware
  column), and flags `is_valid_op` based on net > 0.
- Three admin-only API routes:
  - `POST /api/upload/preview` — parses an Excel file, stages the parsed
    rows in Supabase Storage, returns a signed preview token and a summary.
  - `POST /api/upload/commit` — given a preview token, inserts the rows
    into `invoice_rows`, ensures `consultants` placeholders exist, and
    re-nets `claim_aggregates`.
  - `POST /api/upload/rollback` — removes an upload's rows and re-nets the
    affected aggregates.
- `POST /api/recompute` stub that returns 501 (Part 2).

## Setup

### Prerequisites

- Node.js >= 20
- A Supabase project (cloud or self-hosted)

### Install

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server only — never expose
UPLOAD_PREVIEW_SECRET=<32-byte random base64>  # openssl rand -base64 32
UPLOAD_PREVIEW_BUCKET=upload-previews          # optional, default shown
```

The service role key is used exclusively by `/api/upload/*` to bypass RLS
during ingestion; it must never be sent to the browser.

### Supabase project setup

1. Create a new Supabase project at https://supabase.com/dashboard.
2. Run the migration: `psql <DB URL> -f supabase/migrations/0001_initial.sql`,
   or paste the SQL into the Supabase SQL editor.
3. In Storage, create a private bucket named `upload-previews`.
4. Confirm the auth `users` table maps 1:1 to your `consultants` rows by id.
   For local testing, insert a row by hand and flip `is_director = true`.

### Run dev

```bash
npm run dev
```

Then visit http://localhost:3000.

### Pure-JS parser/netting smoke test

You can sanity-check the Excel parser and the netting math without any
Supabase wiring by running:

```bash
npx tsx scripts/smoke-parse.ts
```

Against the bundled sample (`FX invoices Report ... (29).xlsx`) you should
see 33 rows parsed, 0 errors, 28 unique claims, 26 valid ops, and 2 invalid
ops (Energiesprong, a clean cancellation, and Tame Valley, a 2-row credit
that nets to zero). Negative-net cases would also show as invalid; this
sample doesn't include one.

### Smoke test the upload pipeline

With the dev server running and a director cookie in your browser:

```bash
# 1. preview
curl -X POST http://localhost:3000/api/upload/preview \
  -H "Cookie: <your-supabase-auth-cookies>" \
  -F "file=@FX invoices Report (account.invoice.fx.report) (29).xlsx"
# => { preview_token, summary, errors, ... }

# 2. commit
curl -X POST http://localhost:3000/api/upload/commit \
  -H "Cookie: <your-supabase-auth-cookies>" \
  -H "Content-Type: application/json" \
  -d '{"preview_token":"<paste token from step 1>","notes":"first commit"}'
# => { upload_id, committed: true, claim_count, aggregates_upserted, ... }

# 3. rollback (optional)
curl -X POST http://localhost:3000/api/upload/rollback \
  -H "Cookie: <your-supabase-auth-cookies>" \
  -H "Content-Type: application/json" \
  -d '{"upload_id":"<the upload id>"}'
```

## Data Dictionary

The Odoo export has 24 columns. They are mapped to `invoice_rows` columns as
follows (header match is exact, position-independent):

| Excel header                            | DB column                         | Type    |
| --------------------------------------- | --------------------------------- | ------- |
| Claim/Account/Display Name              | client_display_name               | text    |
| Claim                                   | claim_reference                   | text    |
| Product                                 | product                           | text    |
| Invoice Date                            | invoice_date                      | date    |
| Untaxed Amount In Company Currency      | untaxed_amount                    | numeric |
| Invoice/Amount due Exl. Tax             | amount_due_excl_tax               | numeric |
| Claim/Account/Year End                  | year_end_month                    | text    |
| Claim/Lead consultant/Display Name      | lead_consultant_name              | text    |
| Claim/Lead expert/Display Name          | lead_expert_name                  | text    |
| Handover Complete Date                  | handover_complete_date            | date    |
| Overview Complete Date                  | overview_complete_date            | date    |
| Scoping Complete Date                   | scoping_complete_date             | date    |
| Tech Write-up Reviewed Date             | tech_writeup_reviewed_date        | date    |
| Claim/Tech Write-up Reviewer            | tech_writeup_reviewer_name        | text    |
| Cost Assessment Reviewed Date           | cost_assessment_reviewed_date     | date    |
| Claim/Cost Assessment Reviewer          | cost_assessment_reviewer_name     | text    |
| Claim/Financial Documents Received Date | financial_documents_received_date | date    |
| Claim/Costs Received Date               | costs_received_date               | date    |
| Claim/Business Developer                | business_developer_name           | text    |
| Invoice/Last payment date               | last_payment_date                 | date    |
| Claim/Scientific Writer                 | scientific_writer_name            | text    |
| Claim/Financial Analyst                 | financial_analyst_name            | text    |
| Pre-Notification Required               | pre_notification_required         | boolean |
| Pre-notification submission date        | pre_notification_date             | date    |

Dates arrive as Excel serial numbers and are converted via SheetJS's
`XLSX.SSF.parse_date_code`, which handles the 1900 leap-year bug correctly.

## Netting rules

For each `claim_reference`:

1. Sum `amount_due_excl_tax` across all rows → `net_amount`.
2. Latest `invoice_date` across rows → `latest_invoice_date`.
3. Workflow date fields (handover, scoping, tech writeup, etc.) come from the
   row with the latest invoice date; if null there, the most recent non-null
   value wins.
4. `is_valid_op = (net_amount > 0)`. Net-zero (clean cancellation) and net
   negative (rare adjustment) both mark the claim invalid.

## What's next

- **Part 2** — badge catalog, streak engine, record tracking, downstream
  recompute pipeline.
- **Part 3** — consultant dashboard, leaderboard, badges, profile pages.
- **Part 4** — admin upload/history/consultants UI.
- **Part 5** — auth, polish, share cards.
