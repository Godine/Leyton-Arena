-- =====================================================================
-- Leyton Arena — denormalise reviewer fields into claim_aggregates.
--
-- Badges that fire on reviewer activity (Trusted Pair, The Gatekeeper,
-- The Triple Threat) need a fast per-claim lookup of the reviewer for
-- both the tech write-up and the cost assessment. Querying invoice_rows
-- every time would be expensive; the netting pass already has all the
-- data it needs to populate these.
-- =====================================================================

alter table public.claim_aggregates
  add column tech_writeup_reviewer_name        text,
  add column tech_writeup_reviewer_id          uuid references public.consultants(id) on delete set null,
  add column cost_assessment_reviewer_name     text,
  add column cost_assessment_reviewer_id       uuid references public.consultants(id) on delete set null;

create index claim_agg_tech_reviewer_idx
  on public.claim_aggregates (tech_writeup_reviewer_id) where is_valid_op = true;
create index claim_agg_cost_reviewer_idx
  on public.claim_aggregates (cost_assessment_reviewer_id) where is_valid_op = true;
