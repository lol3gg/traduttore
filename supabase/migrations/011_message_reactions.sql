create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  emoji text not null,
  created_at timestamptz default now(),
  unique (message_id, profile_id)
);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions_select_all" on public.message_reactions;
drop policy if exists "reactions_insert_all" on public.message_reactions;
drop policy if exists "reactions_update_all" on public.message_reactions;
drop policy if exists "reactions_delete_all" on public.message_reactions;

create policy "reactions_select_all"
  on public.message_reactions for select
  using (true);

create policy "reactions_insert_all"
  on public.message_reactions for insert
  with check (true);

create policy "reactions_update_all"
  on public.message_reactions for update
  using (true)
  with check (true);

create policy "reactions_delete_all"
  on public.message_reactions for delete
  using (true);

alter table public.message_reactions replica identity full;

do $$
begin
  alter publication supabase_realtime add table message_reactions;
exception when duplicate_object then null;
end $$;
