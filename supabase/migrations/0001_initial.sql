-- =====================================================================
-- Leyton Arena — initial schema
-- =====================================================================
-- Conventions
--   * snake_case for tables and columns
--   * `role` is always one of ('technical', 'financial')
--   * monetary values are NUMERIC(12,2)
--   * RLS is enabled on every user-facing table; the service role used by
--     /api/upload/* bypasses RLS for ingestion writes.
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- consultants
-- =====================================================================
create table public.consultants (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  display_name         text not null,
  normalized_name      text not null,
  primary_role         text not null default 'technical'
                       check (primary_role in ('technical', 'financial', 'both')),
  office               text,
  has_technical_data   boolean not null default false,
  has_financial_data   boolean not null default false,
  is_director          boolean not null default false,
  joined_at            timestamptz not null default now()
);

create unique index consultants_normalized_name_uniq
  on public.consultants (normalized_name);
create index consultants_email_idx on public.consultants (email);

-- ---------- helper: who am I? -----------------------------------------
-- Returns true if the calling auth.uid() maps to a consultant flagged as a
-- director. Used by RLS policies on admin-only tables. Defined here, after
-- the consultants table, because Postgres validates the function body at
-- create time. Migration 0003 rewrites this to use auth_user_id once the
-- column is added.
create or replace function public.current_is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.is_director
       from public.consultants c
      where c.id = auth.uid()),
    false
  );
$$;

-- =====================================================================
-- uploads
-- =====================================================================
create table public.uploads (
  id                uuid primary key default gen_random_uuid(),
  uploader_id       uuid references public.consultants(id) on delete set null,
  filename          text not null,
  file_size_bytes   integer not null default 0,
  row_count         integer not null default 0,
  status            text not null default 'pending'
                    check (status in ('pending','previewed','committed','rolled_back','failed')),
  notes             text,
  preview_summary   jsonb,
  uploaded_at       timestamptz not null default now(),
  committed_at      timestamptz,
  rolled_back_at    timestamptz,
  error_message     text
);

create index uploads_status_idx on public.uploads (status);
create index uploads_uploaded_at_idx on public.uploads (uploaded_at desc);

-- =====================================================================
-- invoice_rows — raw per-row data from every committed upload
-- =====================================================================
create table public.invoice_rows (
  id                                  uuid primary key default gen_random_uuid(),
  upload_id                           uuid not null references public.uploads(id) on delete cascade,
  claim_reference                     text not null,
  client_display_name                 text,
  product                             text,
  invoice_date                        date,
  untaxed_amount                      numeric(12,2),
  amount_due_excl_tax                 numeric(12,2),
  year_end_month                      text,
  lead_consultant_name                text,
  lead_expert_name                    text,
  handover_complete_date              date,
  overview_complete_date              date,
  scoping_complete_date               date,
  tech_writeup_reviewed_date          date,
  tech_writeup_reviewer_name          text,
  cost_assessment_reviewed_date       date,
  cost_assessment_reviewer_name       text,
  financial_documents_received_date   date,
  costs_received_date                 date,
  business_developer_name             text,
  last_payment_date                   date,
  scientific_writer_name              text,
  financial_analyst_name              text,
  pre_notification_required           boolean,
  pre_notification_date               date,
  raw_row                             jsonb not null,
  created_at                          timestamptz not null default now()
);

create index invoice_rows_claim_ref_idx       on public.invoice_rows (claim_reference);
create index invoice_rows_lead_consultant_idx on public.invoice_rows (lead_consultant_name);
create index invoice_rows_lead_expert_idx     on public.invoice_rows (lead_expert_name);
create index invoice_rows_upload_id_idx       on public.invoice_rows (upload_id);
create index invoice_rows_invoice_date_idx    on public.invoice_rows (invoice_date);

-- =====================================================================
-- claim_aggregates — one row per claim_reference, recomputed after each upload
-- =====================================================================
create table public.claim_aggregates (
  claim_reference                     text primary key,
  net_amount                          numeric(12,2) not null,
  latest_invoice_date                 date not null,
  is_valid_op                         boolean not null,
  row_count                           integer not null default 0,
  lead_consultant_id                  uuid references public.consultants(id) on delete set null,
  lead_expert_id                      uuid references public.consultants(id) on delete set null,
  client_display_name                 text,
  product                             text,
  year_end_month                      text,
  handover_complete_date              date,
  overview_complete_date              date,
  scoping_complete_date               date,
  tech_writeup_reviewed_date          date,
  cost_assessment_reviewed_date       date,
  financial_documents_received_date   date,
  costs_received_date                 date,
  pre_notification_required           boolean,
  pre_notification_date               date,
  recomputed_at                       timestamptz not null default now()
);

create index claim_agg_lead_consultant_idx
  on public.claim_aggregates (lead_consultant_id) where is_valid_op = true;
create index claim_agg_lead_expert_idx
  on public.claim_aggregates (lead_expert_id) where is_valid_op = true;
create index claim_agg_latest_invoice_idx
  on public.claim_aggregates (latest_invoice_date);
create index claim_agg_is_valid_idx
  on public.claim_aggregates (is_valid_op);

-- =====================================================================
-- badges_earned
-- =====================================================================
create table public.badges_earned (
  id              uuid primary key default gen_random_uuid(),
  consultant_id   uuid not null references public.consultants(id) on delete cascade,
  badge_key       text not null,
  role            text not null check (role in ('technical','financial')),
  tier            text not null check (tier in ('bronze','silver','gold','platinum','diamond','mythic')),
  earned_at       timestamptz not null,
  progress_data   jsonb,
  constraint badges_earned_unique unique (consultant_id, badge_key, role, tier)
);

create index badges_earned_consultant_idx on public.badges_earned (consultant_id);
create index badges_earned_badge_idx on public.badges_earned (badge_key, role, tier);

-- =====================================================================
-- streaks
-- =====================================================================
create table public.streaks (
  id                  uuid primary key default gen_random_uuid(),
  consultant_id       uuid not null references public.consultants(id) on delete cascade,
  role                text not null check (role in ('technical','financial')),
  streak_type         text not null,
  current_count       integer not null default 0,
  best_count          integer not null default 0,
  started_at          date,
  last_extended_at    date,
  is_active           boolean not null default true,
  constraint streaks_unique unique (consultant_id, role, streak_type)
);

create index streaks_consultant_idx on public.streaks (consultant_id);
create index streaks_active_idx on public.streaks (is_active) where is_active = true;

-- =====================================================================
-- records — hall of fame, current and historical
-- =====================================================================
create table public.records (
  id                     uuid primary key default gen_random_uuid(),
  record_key             text not null,
  role                   text not null check (role in ('technical','financial')),
  holder_id              uuid references public.consultants(id) on delete set null,
  holder_display_name    text not null,
  value                  numeric not null,
  value_label            text not null,
  achieved_at            date not null,
  context                jsonb,
  is_current             boolean not null default true,
  set_at                 timestamptz not null default now()
);

create index records_key_role_idx on public.records (record_key, role);
create unique index records_current_unique
  on public.records (record_key, role) where is_current = true;
create index records_holder_idx on public.records (holder_id);

-- =====================================================================
-- monthly_snapshots — cached per-consultant, per-role, per-month aggregates
-- =====================================================================
create table public.monthly_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  consultant_id       uuid not null references public.consultants(id) on delete cascade,
  role                text not null check (role in ('technical','financial')),
  year_month          text not null,  -- 'YYYY-MM'
  ops_count           integer not null default 0,
  net_fees            numeric(12,2) not null default 0,
  avg_cycle_days      numeric(5,1),
  rank                integer,
  total_consultants   integer,
  tier                text,
  computed_at         timestamptz not null default now(),
  constraint monthly_snapshots_unique unique (consultant_id, role, year_month)
);

create index monthly_snapshots_role_month_idx
  on public.monthly_snapshots (role, year_month);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.consultants        enable row level security;
alter table public.uploads            enable row level security;
alter table public.invoice_rows       enable row level security;
alter table public.claim_aggregates   enable row level security;
alter table public.badges_earned      enable row level security;
alter table public.streaks            enable row level security;
alter table public.records            enable row level security;
alter table public.monthly_snapshots  enable row level security;

-- ---- consultants -----------------------------------------------------
-- Everyone authenticated can see the public-facing display fields on every
-- consultant (name, office, role flags). The `email` and `is_director` fields
-- are also visible — these are not sensitive within an internal tool, and
-- omitting them at the row level isn't possible without column-level masking.
create policy "consultants_read_all_authenticated"
  on public.consultants for select
  to authenticated
  using (true);

create policy "consultants_director_all"
  on public.consultants for all
  to authenticated
  using (public.current_is_director())
  with check (public.current_is_director());

-- ---- uploads — admin-only -------------------------------------------
create policy "uploads_director_select"
  on public.uploads for select
  to authenticated
  using (public.current_is_director());

-- ---- invoice_rows — admin-only --------------------------------------
create policy "invoice_rows_director_select"
  on public.invoice_rows for select
  to authenticated
  using (public.current_is_director());

-- ---- claim_aggregates ------------------------------------------------
-- A consultant can see every claim where they are lead consultant or lead
-- expert. Directors see everything.
create policy "claim_aggregates_self"
  on public.claim_aggregates for select
  to authenticated
  using (
    lead_consultant_id = auth.uid()
    or lead_expert_id  = auth.uid()
    or public.current_is_director()
  );

-- ---- badges_earned ---------------------------------------------------
-- Consultants see their own badge earns; the leaderboard endpoint joins on
-- consultants for everyone else's tier counts via aggregated views (added
-- later). Directors see everything.
create policy "badges_earned_self"
  on public.badges_earned for select
  to authenticated
  using (consultant_id = auth.uid() or public.current_is_director());

-- ---- streaks ---------------------------------------------------------
create policy "streaks_self"
  on public.streaks for select
  to authenticated
  using (consultant_id = auth.uid() or public.current_is_director());

-- ---- records ---------------------------------------------------------
create policy "records_read_all_authenticated"
  on public.records for select
  to authenticated
  using (true);

-- ---- monthly_snapshots ----------------------------------------------
-- Snapshots back the leaderboard, so every authenticated consultant needs to
-- read them for everyone.
create policy "monthly_snapshots_read_all_authenticated"
  on public.monthly_snapshots for select
  to authenticated
  using (true);
