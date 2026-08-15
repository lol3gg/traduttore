-- Profiles: the two chat participants
-- RLS: see 002_rls.sql (permissive policies for anon key; no Auth)
create table profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lang text not null check (lang in ('it', 'ru')),
  theme_color text not null,
  is_online boolean default false,
  is_typing boolean default false,
  last_seen timestamptz default now(),
  onesignal_player_id text
);

-- Messages: chat messages with optional translation
create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  original_text text not null,
  original_lang text not null check (original_lang in ('it', 'ru')),
  translated_text text,
  translated_lang text,
  created_at timestamptz default now(),
  read_at timestamptz
);

-- Enable Realtime for presence and live messages
alter publication supabase_realtime add table profiles, messages;

-- Seed: the two chat partners
insert into profiles (name, lang, theme_color) values
  ('Nico', 'it', '#3B82F6'),
  ('Dasha', 'ru', '#EC4899');
