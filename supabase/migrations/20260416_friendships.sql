-- Friendships table and RLS policies.
-- Safe to re-run: all CREATE statements use IF NOT EXISTS or OR REPLACE.

begin;

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id           uuid        not null default gen_random_uuid() primary key,
  requester_id uuid        not null references public.profiles(id) on delete cascade,
  receiver_id  uuid        not null references public.profiles(id) on delete cascade,
  status       text        not null default 'pending'
                           check (status in ('pending', 'accepted', 'blocked')),
  created_at   timestamptz not null default now(),
  constraint friendships_no_self_friend check (requester_id <> receiver_id),
  constraint friendships_unique_pair    unique (requester_id, receiver_id)
);

create index if not exists friendships_requester_id_idx on public.friendships (requester_id);
create index if not exists friendships_receiver_id_idx  on public.friendships (receiver_id);
create index if not exists friendships_pair_idx         on public.friendships (requester_id, receiver_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.friendships enable row level security;

-- SELECT: both parties can see the row
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select"
  on public.friendships
  for select
  using (
    auth.uid() = requester_id
    or auth.uid() = receiver_id
  );

-- INSERT: only the requester may create a row, and they must be auth.uid()
drop policy if exists "friendships_insert" on public.friendships;
create policy "friendships_insert"
  on public.friendships
  for insert
  with check (
    auth.uid() = requester_id
  );

-- UPDATE: only the receiver may accept/change status (e.g. pending → accepted)
drop policy if exists "friendships_update" on public.friendships;
create policy "friendships_update"
  on public.friendships
  for update
  using  (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- DELETE: either party may cancel, decline, or remove
drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete"
  on public.friendships
  for delete
  using (
    auth.uid() = requester_id
    or auth.uid() = receiver_id
  );

commit;
