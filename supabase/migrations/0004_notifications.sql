-- =====================================================================
-- Leyton Arena — notifications + visit tracking.
--
-- The notifications feed backs the bell dropdown and the live Sonner
-- toasts. We also need a `last_visited_at` on consultants so the
-- dashboard can pulse newly-earned badges for the first 3 seconds of the
-- visit they're first seen.
-- =====================================================================

alter table public.consultants
  add column last_visited_at timestamptz;

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  consultant_id   uuid not null references public.consultants(id) on delete cascade,
  type            text not null check (type in (
    'badge_unlock',
    'streak_milestone',
    'record_taken',
    'record_lost'
  )),
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index notifications_consultant_idx
  on public.notifications (consultant_id, created_at desc);

create index notifications_consultant_unread_idx
  on public.notifications (consultant_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_self_select"
  on public.notifications for select
  to authenticated
  using (consultant_id = public.current_consultant_id());

create policy "notifications_self_update"
  on public.notifications for update
  to authenticated
  using (consultant_id = public.current_consultant_id())
  with check (consultant_id = public.current_consultant_id());

-- Realtime: the consultant UI subscribes to per-consultant inserts.
alter publication supabase_realtime add table public.notifications;
