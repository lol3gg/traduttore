-- Fix missing photo storage + realtime reliability
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table messages add column if not exists image_url text;
alter table messages alter column original_text set default '';

create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists messages_created_at_idx on public.messages (created_at);

drop policy if exists "chat_images_public_read" on storage.objects;
drop policy if exists "chat_images_anon_upload" on storage.objects;
drop policy if exists "chat_images_anon_update" on storage.objects;
drop policy if exists "chat_images_anon_delete" on storage.objects;

create policy "chat_images_public_read"
  on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "chat_images_anon_upload"
  on storage.objects for insert
  with check (bucket_id = 'chat-images');

create policy "chat_images_anon_update"
  on storage.objects for update
  using (bucket_id = 'chat-images')
  with check (bucket_id = 'chat-images');

create policy "chat_images_anon_delete"
  on storage.objects for delete
  using (bucket_id = 'chat-images');

alter table public.profiles replica identity full;
alter table public.messages replica identity full;

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
