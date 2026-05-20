-- =====================================================================
-- Leyton Arena — demo seed
-- =====================================================================
-- Idempotent. Safe to re-run; INSERT ... ON CONFLICT DO NOTHING throughout.
-- Uses fixed UUIDs so the cross-table foreign keys line up.
--
-- Creates:
--   * 12 consultants (1 director + 6 technical + 5 financial)
--   * 15 claim_aggregates spanning this month and last month
--   * monthly_snapshots for the current month, ranked
--   * badges_earned (Op Machine, Heavyweight, The Whale, Built Different,
--     Empire Builder, Comeback Kid, Lightning Rod)
--   * 4 streaks
--   * 6 hall-of-fame records
--   * 8 notifications (badge unlocks + record events)
--
-- To wipe and reseed, run the TRUNCATE block at the bottom of this file
-- first, then re-run the rest.
-- =====================================================================

-- ---- consultants -----------------------------------------------------
insert into public.consultants
  (id, email, display_name, normalized_name, primary_role, office,
   has_technical_data, has_financial_data, is_director)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@leyton.com',     'Admin Demo',             'admin demo',             'both',      'London',     true,  true,  true),
  -- Technical consultants
  ('00000000-0000-0000-0000-000000000010', 'hanan@leyton.com',     'Hanan EL BHILAT',        'hanan el bhilat',        'technical', 'Casablanca', true,  false, false),
  ('00000000-0000-0000-0000-000000000011', 'rikhil@leyton.com',    'Rikhil Shah',            'rikhil shah',            'technical', 'London',     true,  false, false),
  ('00000000-0000-0000-0000-000000000012', 'jack@leyton.com',      'Jack Notting',           'jack notting',           'technical', 'London',     true,  false, false),
  ('00000000-0000-0000-0000-000000000013', 'hugo@leyton.com',      'Hugo Morgan',            'hugo morgan',            'technical', 'London',     true,  false, false),
  ('00000000-0000-0000-0000-000000000014', 'fatima@leyton.com',    'Fatima Ezzahra LAASRI',  'fatima ezzahra laasri',  'technical', 'Casablanca', true,  false, false),
  ('00000000-0000-0000-0000-000000000015', 'sam@leyton.com',       'Sam Todd',               'sam todd',               'technical', 'Dublin',     true,  false, false),
  -- Financial consultants
  ('00000000-0000-0000-0000-000000000020', 'marco@leyton.com',     'Marco SPIRO',            'marco spiro',            'financial', 'London',     false, true,  false),
  ('00000000-0000-0000-0000-000000000021', 'christalin@leyton.com','Christalin Thevathasan', 'christalin thevathasan', 'financial', 'London',     false, true,  false),
  ('00000000-0000-0000-0000-000000000022', 'stephen@leyton.com',   'Stephen James',          'stephen james',          'financial', 'Dublin',     false, true,  false),
  ('00000000-0000-0000-0000-000000000023', 'basma@leyton.com',     'Basma RABEH',            'basma rabeh',            'financial', 'Casablanca', false, true,  false),
  ('00000000-0000-0000-0000-000000000024', 'robert@leyton.com',    'Robert STRUTT',          'robert strutt',          'financial', 'London',     false, true,  false)
on conflict (id) do nothing;

-- ---- claim_aggregates -----------------------------------------------
-- Helper: this-month start as a date. Postgres functions used inline so the
-- seed always points at "now" regardless of when it's run.
--
-- Schema fields ordered:
--   claim_reference, net_amount, latest_invoice_date, is_valid_op, row_count,
--   lead_consultant_id, lead_expert_id, client_display_name, product,
--   year_end_month, handover_complete_date, overview_complete_date,
--   scoping_complete_date, tech_writeup_reviewed_date,
--   cost_assessment_reviewed_date, financial_documents_received_date,
--   costs_received_date, pre_notification_required, pre_notification_date,
--   tech_writeup_reviewer_name, tech_writeup_reviewer_id,
--   cost_assessment_reviewer_name, cost_assessment_reviewer_id

insert into public.claim_aggregates (
  claim_reference, net_amount, latest_invoice_date, is_valid_op, row_count,
  lead_consultant_id, lead_expert_id, client_display_name, product, year_end_month,
  handover_complete_date, overview_complete_date, scoping_complete_date,
  tech_writeup_reviewed_date, cost_assessment_reviewed_date,
  financial_documents_received_date, costs_received_date,
  pre_notification_required, pre_notification_date,
  tech_writeup_reviewer_name, tech_writeup_reviewer_id,
  cost_assessment_reviewer_name, cost_assessment_reviewer_id
)
values
  -- Hanan + Marco — the dominant technical+financial pair this month
  ('RDTC UK - Sensio Limited - 2024',          7470.61,   (date_trunc('month', now()) + interval '4 days')::date,  true, 1,
   '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
   'Sensio Limited', 'RDTC UK', 'December',
   (date_trunc('month', now()) - interval '40 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) + interval '3 days')::date,
   (date_trunc('month', now()) + interval '4 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   false, null,
   'Hugo Morgan',  '00000000-0000-0000-0000-000000000013',
   'Robert STRUTT','00000000-0000-0000-0000-000000000024'),

  ('RDTC UK - Engine House VFX - 2025',        3500.00,   (date_trunc('month', now()) + interval '6 days')::date,  true, 1,
   '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022',
   'Engine House VFX Limited', 'RDTC UK', 'September',
   (date_trunc('month', now()) - interval '45 days')::date,
   (date_trunc('month', now()) - interval '45 days')::date,
   (date_trunc('month', now()) - interval '25 days')::date,
   (date_trunc('month', now()) + interval '5 days')::date,
   (date_trunc('month', now()) + interval '6 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   true,  (date_trunc('month', now()) - interval '90 days')::date,
   'Hugo Morgan',   '00000000-0000-0000-0000-000000000013',
   'Marco SPIRO',   '00000000-0000-0000-0000-000000000020'),

  ('RDTC UK - Northern Tech - 2024',           42850.00,  (date_trunc('month', now()) + interval '8 days')::date,  true, 1,
   '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
   'Northern Tech Plc', 'RDTC UK', 'March',
   (date_trunc('month', now()) - interval '35 days')::date,
   (date_trunc('month', now()) - interval '35 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) + interval '7 days')::date,
   (date_trunc('month', now()) + interval '8 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   false, null,
   'Hugo Morgan',  '00000000-0000-0000-0000-000000000013',
   'Robert STRUTT','00000000-0000-0000-0000-000000000024'),

  -- Rikhil's whale (mythic-tier fee)
  ('RDTC UK - Atlas Pharma - 2024',           152000.00,  (date_trunc('month', now()) + interval '10 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000020',
   'Atlas Pharma Holdings', 'RDTC UK', 'December',
   (date_trunc('month', now()) - interval '60 days')::date,
   (date_trunc('month', now()) - interval '60 days')::date,
   (date_trunc('month', now()) - interval '45 days')::date,
   (date_trunc('month', now()) + interval '9 days')::date,
   (date_trunc('month', now()) + interval '10 days')::date,
   (date_trunc('month', now()) - interval '50 days')::date,
   (date_trunc('month', now()) - interval '50 days')::date,
   true, (date_trunc('month', now()) - interval '120 days')::date,
   'Jack Notting',  '00000000-0000-0000-0000-000000000012',
   'Marco SPIRO',   '00000000-0000-0000-0000-000000000020'),

  ('CIR UK - Riverside Logistics - 2024',     31200.00,  (date_trunc('month', now()) + interval '12 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
   'Riverside Logistics', 'CIR UK', 'June',
   (date_trunc('month', now()) - interval '50 days')::date,
   (date_trunc('month', now()) - interval '50 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   (date_trunc('month', now()) + interval '11 days')::date,
   (date_trunc('month', now()) + interval '12 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   false, null,
   'Jack Notting',  '00000000-0000-0000-0000-000000000012',
   'Robert STRUTT', '00000000-0000-0000-0000-000000000024'),

  -- Jack's claims
  ('RDTC UK - Greenfield Manufacturing - 2024', 12500.00, (date_trunc('month', now()) + interval '14 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000022',
   'Greenfield Manufacturing', 'RDTC UK', 'March',
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) - interval '10 days')::date,
   (date_trunc('month', now()) + interval '13 days')::date,
   (date_trunc('month', now()) + interval '14 days')::date,
   (date_trunc('month', now()) - interval '15 days')::date,
   (date_trunc('month', now()) - interval '15 days')::date,
   false, null,
   'Hugo Morgan',   '00000000-0000-0000-0000-000000000013',
   'Christalin Thevathasan', '00000000-0000-0000-0000-000000000021'),

  ('CIR UK - Bluebird Studios - 2025',         8800.00, (date_trunc('month', now()) + interval '15 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000023',
   'Bluebird Studios', 'CIR UK', 'September',
   (date_trunc('month', now()) - interval '18 days')::date,
   (date_trunc('month', now()) - interval '18 days')::date,
   (date_trunc('month', now()) - interval '8 days')::date,
   (date_trunc('month', now()) + interval '13 days')::date,
   (date_trunc('month', now()) + interval '15 days')::date,
   (date_trunc('month', now()) - interval '12 days')::date,
   (date_trunc('month', now()) - interval '12 days')::date,
   false, null,
   'Fatima Ezzahra LAASRI',  '00000000-0000-0000-0000-000000000014',
   'Stephen James',           '00000000-0000-0000-0000-000000000022'),

  -- Hugo's claims
  ('RDTC UK - Acme Robotics - 2024',          24600.00, (date_trunc('month', now()) + interval '16 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000021',
   'Acme Robotics', 'RDTC UK', 'December',
   (date_trunc('month', now()) - interval '25 days')::date,
   (date_trunc('month', now()) - interval '25 days')::date,
   (date_trunc('month', now()) - interval '15 days')::date,
   (date_trunc('month', now()) + interval '14 days')::date,
   (date_trunc('month', now()) + interval '16 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   true, (date_trunc('month', now()) - interval '95 days')::date,
   'Jack Notting',  '00000000-0000-0000-0000-000000000012',
   'Marco SPIRO',   '00000000-0000-0000-0000-000000000020'),

  ('CIR UK - PrimeTech - 2024',                5300.00, (date_trunc('month', now()) + interval '18 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000024',
   'PrimeTech', 'CIR UK', 'June',
   (date_trunc('month', now()) - interval '14 days')::date,
   (date_trunc('month', now()) - interval '14 days')::date,
   (date_trunc('month', now()) - interval '4 days')::date,
   (date_trunc('month', now()) + interval '17 days')::date,
   (date_trunc('month', now()) + interval '18 days')::date,
   (date_trunc('month', now()) - interval '10 days')::date,
   (date_trunc('month', now()) - interval '10 days')::date,
   false, null,
   'Fatima Ezzahra LAASRI', '00000000-0000-0000-0000-000000000014',
   'Christalin Thevathasan','00000000-0000-0000-0000-000000000021'),

  -- Fatima's claims
  ('RDTC UK - Casablanca Innovations - 2024', 18750.00, (date_trunc('month', now()) + interval '17 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000023',
   'Casablanca Innovations', 'RDTC UK', 'March',
   (date_trunc('month', now()) - interval '30 days')::date,
   (date_trunc('month', now()) - interval '30 days')::date,
   (date_trunc('month', now()) - interval '12 days')::date,
   (date_trunc('month', now()) + interval '15 days')::date,
   (date_trunc('month', now()) + interval '17 days')::date,
   (date_trunc('month', now()) - interval '24 days')::date,
   (date_trunc('month', now()) - interval '24 days')::date,
   false, null,
   'Hanan EL BHILAT', '00000000-0000-0000-0000-000000000010',
   'Marco SPIRO',     '00000000-0000-0000-0000-000000000020'),

  -- Sam's claims (the consultant-PIN default impersonation target)
  ('CIR UK - Dublin Drinks Co - 2025',         4200.00, (date_trunc('month', now()) + interval '19 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000022',
   'Dublin Drinks Co', 'CIR UK', 'September',
   (date_trunc('month', now()) - interval '21 days')::date,
   (date_trunc('month', now()) - interval '21 days')::date,
   (date_trunc('month', now()) - interval '7 days')::date,
   (date_trunc('month', now()) + interval '17 days')::date,
   (date_trunc('month', now()) + interval '19 days')::date,
   (date_trunc('month', now()) - interval '17 days')::date,
   (date_trunc('month', now()) - interval '17 days')::date,
   false, null,
   'Jack Notting', '00000000-0000-0000-0000-000000000012',
   'Robert STRUTT','00000000-0000-0000-0000-000000000024'),

  ('RDTC UK - Eastside Foods - 2024',          9800.00, (date_trunc('month', now()) + interval '20 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000021',
   'Eastside Foods', 'RDTC UK', 'December',
   (date_trunc('month', now()) - interval '16 days')::date,
   (date_trunc('month', now()) - interval '16 days')::date,
   (date_trunc('month', now()) - interval '6 days')::date,
   (date_trunc('month', now()) + interval '18 days')::date,
   (date_trunc('month', now()) + interval '20 days')::date,
   (date_trunc('month', now()) - interval '13 days')::date,
   (date_trunc('month', now()) - interval '13 days')::date,
   false, null,
   'Hugo Morgan',           '00000000-0000-0000-0000-000000000013',
   'Christalin Thevathasan','00000000-0000-0000-0000-000000000021'),

  -- Last month's data
  ('RDTC UK - Lakeshore Logistics - 2024',    22100.00, (date_trunc('month', now()) - interval '20 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
   'Lakeshore Logistics', 'RDTC UK', 'December',
   (date_trunc('month', now()) - interval '60 days')::date,
   (date_trunc('month', now()) - interval '60 days')::date,
   (date_trunc('month', now()) - interval '50 days')::date,
   (date_trunc('month', now()) - interval '21 days')::date,
   (date_trunc('month', now()) - interval '20 days')::date,
   (date_trunc('month', now()) - interval '55 days')::date,
   (date_trunc('month', now()) - interval '55 days')::date,
   false, null,
   'Jack Notting',  '00000000-0000-0000-0000-000000000012',
   'Marco SPIRO',   '00000000-0000-0000-0000-000000000020'),

  ('CIR UK - Olive Press Media - 2025',       11400.00, (date_trunc('month', now()) - interval '15 days')::date, true, 1,
   '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021',
   'Olive Press Media', 'CIR UK', 'September',
   (date_trunc('month', now()) - interval '45 days')::date,
   (date_trunc('month', now()) - interval '45 days')::date,
   (date_trunc('month', now()) - interval '35 days')::date,
   (date_trunc('month', now()) - interval '16 days')::date,
   (date_trunc('month', now()) - interval '15 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   (date_trunc('month', now()) - interval '40 days')::date,
   true,  (date_trunc('month', now()) - interval '180 days')::date,
   'Hanan EL BHILAT', '00000000-0000-0000-0000-000000000010',
   'Christalin Thevathasan','00000000-0000-0000-0000-000000000021'),

  -- A cancelled / invalid claim (zero net) for visual variety
  ('RDTC UK - Cancelled Co - 2025',                0.00, (date_trunc('month', now()) + interval '2 days')::date,  false, 2,
   '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000023',
   'Cancelled Co', 'RDTC UK', 'September',
   (date_trunc('month', now()) - interval '10 days')::date,
   (date_trunc('month', now()) - interval '10 days')::date,
   (date_trunc('month', now()) - interval '5 days')::date,
   null, null,
   (date_trunc('month', now()) - interval '8 days')::date,
   (date_trunc('month', now()) - interval '8 days')::date,
   false, null, null, null, null, null)
on conflict (claim_reference) do nothing;

-- ---- monthly_snapshots ----------------------------------------------
-- Per-(role, current month) ranked by ops_count, with net_fees tiebreaker.
-- Manually pre-computed to match the claim_aggregates above.
--
-- Technical this month:
--   Hanan: 3 ops, £53,820
--   Rikhil: 2 ops, £183,200 (the whale)
--   Jack: 2 ops, £21,300
--   Hugo: 2 ops, £29,900
--   Fatima: 1 op, £18,750
--   Sam: 2 ops, £14,000
--
-- Financial this month:
--   Marco: 3 ops, £202,320
--   Christalin: 3 ops, £45,500
--   Stephen: 2 ops, £7,700
--   Basma: 1 op, £18,750
--   Robert: 3 ops, £85,750

insert into public.monthly_snapshots
  (consultant_id, role, year_month, ops_count, net_fees, avg_cycle_days, rank, total_consultants)
values
  ('00000000-0000-0000-0000-000000000010','technical', to_char(now(),'YYYY-MM'), 3, 53820.61, 44.0, 1, 6),
  ('00000000-0000-0000-0000-000000000013','technical', to_char(now(),'YYYY-MM'), 2, 29900.00, 22.5, 2, 6),
  ('00000000-0000-0000-0000-000000000011','technical', to_char(now(),'YYYY-MM'), 2, 183200.00, 56.0, 3, 6),
  ('00000000-0000-0000-0000-000000000012','technical', to_char(now(),'YYYY-MM'), 2, 21300.00, 19.5, 4, 6),
  ('00000000-0000-0000-0000-000000000015','technical', to_char(now(),'YYYY-MM'), 2, 14000.00, 17.5, 5, 6),
  ('00000000-0000-0000-0000-000000000014','technical', to_char(now(),'YYYY-MM'), 1, 18750.00, 45.0, 6, 6),

  ('00000000-0000-0000-0000-000000000020','financial', to_char(now(),'YYYY-MM'), 3, 202320.00, 45.5, 1, 5),
  ('00000000-0000-0000-0000-000000000024','financial', to_char(now(),'YYYY-MM'), 3, 85750.00,  29.5, 2, 5),
  ('00000000-0000-0000-0000-000000000021','financial', to_char(now(),'YYYY-MM'), 3, 45500.00,  31.0, 3, 5),
  ('00000000-0000-0000-0000-000000000022','financial', to_char(now(),'YYYY-MM'), 2, 7700.00,   22.0, 4, 5),
  ('00000000-0000-0000-0000-000000000023','financial', to_char(now(),'YYYY-MM'), 1, 18750.00,  47.0, 5, 5)
on conflict (consultant_id, role, year_month) do nothing;

-- Snapshot for last month (sparse — used by the dashboard's trend line)
insert into public.monthly_snapshots
  (consultant_id, role, year_month, ops_count, net_fees, avg_cycle_days, rank, total_consultants)
values
  ('00000000-0000-0000-0000-000000000010','technical', to_char(now() - interval '1 month','YYYY-MM'), 1, 22100.00, 40.0, 1, 2),
  ('00000000-0000-0000-0000-000000000011','technical', to_char(now() - interval '1 month','YYYY-MM'), 1, 11400.00, 30.0, 2, 2),
  ('00000000-0000-0000-0000-000000000020','financial', to_char(now() - interval '1 month','YYYY-MM'), 1, 22100.00, 40.0, 1, 2),
  ('00000000-0000-0000-0000-000000000021','financial', to_char(now() - interval '1 month','YYYY-MM'), 1, 11400.00, 30.0, 2, 2)
on conflict (consultant_id, role, year_month) do nothing;

-- ---- badges_earned --------------------------------------------------
-- Spread across the top performers so the dashboard chips have something
-- to show. Tier color reflects threshold from the catalog.
insert into public.badges_earned (consultant_id, badge_key, role, tier, earned_at, progress_data)
values
  -- Hanan: dominant technical performer
  ('00000000-0000-0000-0000-000000000010','op_machine',     'technical','bronze', now() - interval '2 days', '{"bestMonth":"current","bestCount":3}'),
  ('00000000-0000-0000-0000-000000000010','heavyweight',    'technical','bronze', now() - interval '2 days', '{"max":42850}'),
  ('00000000-0000-0000-0000-000000000010','heavyweight',    'technical','silver', now() - interval '2 days', '{"max":42850}'),
  ('00000000-0000-0000-0000-000000000010','heavyweight',    'technical','gold',   now() - interval '2 days', '{"max":42850}'),
  ('00000000-0000-0000-0000-000000000010','built_different','technical','bronze', now() - interval '2 days', '{"wins":1}'),
  ('00000000-0000-0000-0000-000000000010','lightning_rod',  'technical','bronze', now() - interval '2 days', '{"count":2}'),

  -- Rikhil: The Whale earner
  ('00000000-0000-0000-0000-000000000011','heavyweight',    'technical','bronze',   now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000011','heavyweight',    'technical','silver',   now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000011','heavyweight',    'technical','gold',     now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000011','heavyweight',    'technical','platinum', now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000011','heavyweight',    'technical','diamond',  now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000011','the_whale',      'technical','mythic',   now() - interval '1 day', '{"count":1,"claims":["RDTC UK - Atlas Pharma - 2024"]}'),
  ('00000000-0000-0000-0000-000000000011','empire_builder', 'technical','bronze',   now() - interval '1 day', '{"total":194600}'),

  -- Jack
  ('00000000-0000-0000-0000-000000000012','heavyweight',    'technical','bronze', now() - interval '3 days', '{"max":12500}'),
  ('00000000-0000-0000-0000-000000000012','trusted_pair',   'technical','bronze', now() - interval '3 days', '{"count":4}'),

  -- Hugo: reviewer (lots of Trusted Pair reviews)
  ('00000000-0000-0000-0000-000000000013','heavyweight',    'technical','bronze', now() - interval '5 days', '{"max":24600}'),
  ('00000000-0000-0000-0000-000000000013','heavyweight',    'technical','silver', now() - interval '5 days', '{"max":24600}'),
  ('00000000-0000-0000-0000-000000000013','trusted_pair',   'technical','bronze', now() - interval '5 days', '{"count":4}'),

  -- Marco: dominant financial
  ('00000000-0000-0000-0000-000000000020','op_machine',     'financial','bronze',   now() - interval '1 day', '{"bestMonth":"current","bestCount":3}'),
  ('00000000-0000-0000-0000-000000000020','heavyweight',    'financial','bronze',   now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000020','heavyweight',    'financial','silver',   now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000020','heavyweight',    'financial','gold',     now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000020','heavyweight',    'financial','platinum', now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000020','heavyweight',    'financial','diamond',  now() - interval '1 day', '{"max":152000}'),
  ('00000000-0000-0000-0000-000000000020','the_whale',      'financial','mythic',   now() - interval '1 day', '{"count":1}'),
  ('00000000-0000-0000-0000-000000000020','built_different','financial','bronze',   now() - interval '1 day', '{"wins":1}'),
  ('00000000-0000-0000-0000-000000000020','empire_builder', 'financial','bronze',   now() - interval '1 day', '{"total":224420}'),
  ('00000000-0000-0000-0000-000000000020','the_gatekeeper', 'financial','bronze',   now() - interval '1 day', '{"count":3}'),

  -- Christalin
  ('00000000-0000-0000-0000-000000000021','op_machine',     'financial','bronze', now() - interval '2 days', '{"bestCount":3}'),
  ('00000000-0000-0000-0000-000000000021','heavyweight',    'financial','bronze', now() - interval '2 days', '{"max":24600}'),
  ('00000000-0000-0000-0000-000000000021','heavyweight',    'financial','silver', now() - interval '2 days', '{"max":24600}'),

  -- Robert (financial)
  ('00000000-0000-0000-0000-000000000024','op_machine',     'financial','bronze', now() - interval '3 days', '{"bestCount":3}'),
  ('00000000-0000-0000-0000-000000000024','heavyweight',    'financial','bronze', now() - interval '3 days', '{"max":42850}'),
  ('00000000-0000-0000-0000-000000000024','heavyweight',    'financial','silver', now() - interval '3 days', '{"max":42850}'),
  ('00000000-0000-0000-0000-000000000024','heavyweight',    'financial','gold',   now() - interval '3 days', '{"max":42850}')
on conflict (consultant_id, badge_key, role, tier) do nothing;

-- ---- streaks --------------------------------------------------------
insert into public.streaks
  (consultant_id, role, streak_type, current_count, best_count, started_at, last_extended_at, is_active)
values
  ('00000000-0000-0000-0000-000000000010','technical','iron_streak',         2, 2, (date_trunc('month', now()) - interval '1 month')::date, (date_trunc('month', now()))::date, true),
  ('00000000-0000-0000-0000-000000000020','financial','iron_streak',         2, 2, (date_trunc('month', now()) - interval '1 month')::date, (date_trunc('month', now()))::date, true),
  ('00000000-0000-0000-0000-000000000011','technical','iron_streak',         1, 1, (date_trunc('month', now()) - interval '1 month')::date, (date_trunc('month', now()) - interval '1 month')::date, false),
  ('00000000-0000-0000-0000-000000000020','financial','prenotification_hawk',2, 3, (date_trunc('month', now()) - interval '4 months')::date, (date_trunc('month', now()))::date, true)
on conflict (consultant_id, role, streak_type) do nothing;

-- ---- records --------------------------------------------------------
insert into public.records
  (record_key, role, holder_id, holder_display_name, value, value_label, achieved_at, context, is_current, set_at)
values
  ('most_ops_month_technical',  'technical', '00000000-0000-0000-0000-000000000010','Hanan EL BHILAT', 3,        '3 ops (' || to_char(now(),'YYYY-MM') || ')', date_trunc('month', now())::date, '{}', true, now()),
  ('most_ops_month_financial',  'financial', '00000000-0000-0000-0000-000000000020','Marco SPIRO',     3,        '3 ops (' || to_char(now(),'YYYY-MM') || ')', date_trunc('month', now())::date, '{}', true, now()),
  ('largest_single_fee',        'technical', '00000000-0000-0000-0000-000000000011','Rikhil Shah',     152000,   '£152,000',     (date_trunc('month', now()) + interval '10 days')::date, '{"claim_reference":"RDTC UK - Atlas Pharma - 2024"}', true, now()),
  ('fastest_tech_cycle',        'technical', '00000000-0000-0000-0000-000000000015','Sam Todd',        20,       '20 days',      (date_trunc('month', now()) + interval '19 days')::date, '{}', true, now()),
  ('fastest_financial_cycle',   'financial', '00000000-0000-0000-0000-000000000023','Basma RABEH',     21,       '21 days',      (date_trunc('month', now()) + interval '17 days')::date, '{}', true, now()),
  ('longest_iron_streak',       'technical', '00000000-0000-0000-0000-000000000010','Hanan EL BHILAT', 2,        '2 months',     date_trunc('month', now())::date, '{}', true, now())
on conflict do nothing;

-- ---- notifications --------------------------------------------------
insert into public.notifications (consultant_id, type, payload, created_at)
values
  ('00000000-0000-0000-0000-000000000011','badge_unlock', jsonb_build_object('badge_key','the_whale','badge_name','The Whale','badge_icon','Anchor','role','technical','tier','mythic','progress_label','£152,000 single op'), now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000020','badge_unlock', jsonb_build_object('badge_key','the_whale','badge_name','The Whale','badge_icon','Anchor','role','financial','tier','mythic','progress_label','£152,000 single op'), now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000010','badge_unlock', jsonb_build_object('badge_key','built_different','badge_name','Built Different','badge_icon','Star','role','technical','tier','bronze','progress_label','50% lead over second place'), now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000020','badge_unlock', jsonb_build_object('badge_key','empire_builder','badge_name','Empire Builder','badge_icon','Crown','role','financial','tier','bronze','progress_label','£224,420 lifetime fees'), now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000011','record_taken', jsonb_build_object('record_key','largest_single_fee','role','technical','value_label','£152,000','previous_holder_name', null), now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000010','record_taken', jsonb_build_object('record_key','most_ops_month_technical','role','technical','value_label','3 ops','previous_holder_name', null), now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000010','badge_unlock', jsonb_build_object('badge_key','op_machine','badge_name','Op Machine','badge_icon','Gauge','role','technical','tier','bronze','progress_label','3 ops this month'), now() - interval '3 hours'),
  ('00000000-0000-0000-0000-000000000020','badge_unlock', jsonb_build_object('badge_key','op_machine','badge_name','Op Machine','badge_icon','Gauge','role','financial','tier','bronze','progress_label','3 ops this month'), now() - interval '3 hours')
on conflict do nothing;

-- =====================================================================
-- WIPE BLOCK (uncomment to reset before reseeding)
-- =====================================================================
-- truncate
--   public.notifications,
--   public.badges_earned,
--   public.streaks,
--   public.records,
--   public.monthly_snapshots,
--   public.claim_aggregates,
--   public.invoice_rows,
--   public.uploads,
--   public.consultants
-- restart identity cascade;
