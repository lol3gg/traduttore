-- Questa è un'app privata a 2 utenti senza vera autenticazione.
-- La vera protezione è che l'URL dell'app non è pubblico/indicizzato.
-- Per una vera restrizione per-utente servirebbe Supabase Auth con auth.uid(),
-- non implementato qui per scelta di semplicità.

drop policy if exists "messages_update_all" on public.messages;
drop policy if exists "messages_delete_all" on public.messages;

create policy "messages_update_all"
  on public.messages for update
  using (sender_id in (select id from public.profiles))
  with check (sender_id in (select id from public.profiles));

create policy "messages_delete_all"
  on public.messages for delete
  using (sender_id in (select id from public.profiles));
