-- Photos in chat (also included in chat_full_init when creating from scratch)
alter table messages add column if not exists image_url text;
alter table messages alter column original_text set default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set public = true;

drop policy if exists "chat_images_public_read" on storage.objects;
drop policy if exists "chat_images_anon_upload" on storage.objects;
drop policy if exists "chat_images_anon_update" on storage.objects;

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
