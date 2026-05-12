-- Core table RLS reference migration.
--
-- The profiles and catch_logs base schemas were created directly in the
-- Supabase dashboard before migration tracking was established.  This file
-- documents the expected RLS policies for auditability.  Running it against
-- a project that already has these policies is safe (DROP IF EXISTS + CREATE).
--
-- If you are setting up a fresh project, run this file before seeding data.

begin;

-- ── profiles ─────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Drop old dashboard-created policy names before applying canonical names.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  using (true);  -- public profiles; username search and friend views both need this

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles
  for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- DELETE is intentionally blocked at RLS level.
-- Account deletion is handled exclusively by the delete_account Edge Function
-- using the service role key, which bypasses RLS.
drop policy if exists "profiles_delete" on public.profiles;

-- ── catch_logs ───────────────────────────────────────────────────────────────

alter table public.catch_logs enable row level security;

-- Drop old dashboard-created policy names before applying canonical names.
drop policy if exists "catch_logs_delete_own" on public.catch_logs;
drop policy if exists "catch_logs_insert_own" on public.catch_logs;
drop policy if exists "catch_logs_update_own" on public.catch_logs;

-- Owners see all their own rows; others see public or friends-only catches.
-- The friends-only check (friendship exists in accepted state) is enforced
-- here via a sub-select so no client-side data can bypass visibility rules.
drop policy if exists "catch_logs_select" on public.catch_logs;
create policy "catch_logs_select"
  on public.catch_logs
  for select
  using (
    user_id = auth.uid()
    or is_public = true
    or (
      is_friends_only = true
      and exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = auth.uid() and f.receiver_id = catch_logs.user_id)
            or
            (f.receiver_id  = auth.uid() and f.requester_id = catch_logs.user_id)
          )
      )
    )
  );

drop policy if exists "catch_logs_insert" on public.catch_logs;
create policy "catch_logs_insert"
  on public.catch_logs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "catch_logs_update" on public.catch_logs;
create policy "catch_logs_update"
  on public.catch_logs
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "catch_logs_delete" on public.catch_logs;
create policy "catch_logs_delete"
  on public.catch_logs
  for delete
  using (auth.uid() = user_id);

commit;
