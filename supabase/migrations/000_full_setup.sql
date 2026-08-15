-- Setup completo chat (progetto ysoseiehaexmwkpssmdg)
-- Esegui tutto in: SQL Editor → New query → Run

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lang text not null check (lang in ('it', 'ru')),
  theme_color text not null,
  is_online boolean default false,
  is_typing boolean default false,
  last_seen timestamptz default now(),
  onesignal_player_id text
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  original_text text not null,
  original_lang text not null check (original_lang in ('it', 'ru')),
  translated_text text,
  translated_lang text,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- Realtime (ignora errore se già presenti)
do $$
begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;

-- Seed solo se vuota
insert into profiles (name, lang, theme_color)
select * from (values
  ('Nico', 'it', '#3B82F6'),
  ('Dasha', 'ru', '#EC4899')
) as v(name, lang, theme_color)
where not exists (select 1 from profiles limit 1);

alter table profiles enable row level security;
alter table messages enable row level security;

drop policy if exists "profiles_select_all" on profiles;
drop policy if exists "profiles_insert_all" on profiles;
drop policy if exists "profiles_update_all" on profiles;
drop policy if exists "messages_select_all" on messages;
drop policy if exists "messages_insert_all" on messages;
drop policy if exists "messages_update_all" on messages;

create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_insert_all" on profiles for insert with check (true);
create policy "profiles_update_all" on profiles for update using (true) with check (true);
create policy "messages_select_all" on messages for select using (true);
create policy "messages_insert_all" on messages for insert with check (true);
create policy "messages_update_all" on messages for update using (true) with check (true);
