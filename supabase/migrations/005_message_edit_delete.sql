-- Soft-delete + edit metadata for WhatsApp-style message actions
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

drop policy if exists "messages_delete_all" on public.messages;
create policy "messages_delete_all"
  on public.messages for delete
  using (true);
