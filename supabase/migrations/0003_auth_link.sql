-- =====================================================================
-- Leyton Arena — auth wiring.
--
-- Adds a stable `auth_user_id` link from `consultants` to `auth.users` so
-- magic-link sign-ins can attach to the placeholder rows created by the
-- upload pipeline. RLS policies are rewritten to compare against
-- `auth_user_id` rather than `consultants.id`, which keeps consultant ids
-- (and all the FKs pointing at them) stable across the placeholder ->
-- claimed transition.
--
-- A trigger on `auth.users` insert performs the case-insensitive email
-- match on first sign-in. Directors can also rewire the link manually from
-- /admin/consultants if the trigger's match misses (e.g. dual-mailbox
-- consultants).
-- =====================================================================

-- 1. Schema changes ----------------------------------------------------
alter table public.consultants
  add column auth_user_id uuid unique,
  add column last_seen_in_data date;

-- Backfill: any existing rows where consultants.id happens to equal an
-- auth.users.id should preserve that linkage. Safe no-op on fresh installs.
update public.consultants c
   set auth_user_id = c.id
  from auth.users u
 where u.id = c.id and c.auth_user_id is null;

-- 2. RLS function + policies ------------------------------------------
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
      where c.auth_user_id = auth.uid()),
    false
  );
$$;

-- Returns the calling user's consultants.id, or NULL if no link yet.
create or replace function public.current_consultant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.consultants
   where auth_user_id = auth.uid()
   limit 1;
$$;

-- Replace policies that referenced `id = auth.uid()` so they use the new
-- linkage. `drop policy if exists` keeps the migration re-runnable.
drop policy if exists "consultants_director_all" on public.consultants;
create policy "consultants_director_all"
  on public.consultants for all
  to authenticated
  using (public.current_is_director())
  with check (public.current_is_director());

drop policy if exists "claim_aggregates_self" on public.claim_aggregates;
create policy "claim_aggregates_self"
  on public.claim_aggregates for select
  to authenticated
  using (
    lead_consultant_id = public.current_consultant_id()
    or lead_expert_id  = public.current_consultant_id()
    or tech_writeup_reviewer_id    = public.current_consultant_id()
    or cost_assessment_reviewer_id = public.current_consultant_id()
    or public.current_is_director()
  );

drop policy if exists "badges_earned_self" on public.badges_earned;
create policy "badges_earned_self"
  on public.badges_earned for select
  to authenticated
  using (consultant_id = public.current_consultant_id() or public.current_is_director());

drop policy if exists "streaks_self" on public.streaks;
create policy "streaks_self"
  on public.streaks for select
  to authenticated
  using (consultant_id = public.current_consultant_id() or public.current_is_director());

-- 3. Auth trigger: link auth.users -> consultants by email ------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultants
     set auth_user_id = new.id
   where auth_user_id is null
     and email is not null
     and lower(trim(email)) = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 4. Allow self-edit of own email is NOT granted ----------------------
-- (Email assignment is admin-only — directors manage it from /admin/consultants.)
