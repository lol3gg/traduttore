-- Private 2-user app without Supabase Auth (no auth.uid()).
-- Enable RLS with permissive policies so anon key can read/write.
-- Tighten later if you add proper auth.

alter table profiles enable row level security;
alter table messages enable row level security;

-- Drop existing policies if re-running
drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_insert_all" on profiles;
drop policy if exists "profiles_update_all" on profiles;
drop policy if exists "messages_select_all" on messages;
drop policy if exists "messages_insert_all" on messages;
drop policy if exists "messages_update_all" on messages;

create policy "profiles_select_all"
  on profiles for select
  using (true);

create policy "profiles_insert_all"
  on profiles for insert
  with check (true);

create policy "profiles_update_all"
  on profiles for update
  using (true)
  with check (true);

create policy "messages_select_all"
  on messages for select
  using (true);

create policy "messages_insert_all"
  on messages for insert
  with check (true);

create policy "messages_update_all"
  on messages for update
  using (true)
  with check (true);

-- Note: service_role (edge functions) bypasses RLS automatically.
