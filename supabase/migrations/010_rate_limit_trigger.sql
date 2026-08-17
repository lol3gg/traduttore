create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '5 seconds';

  if recent_count >= 15 then
    raise exception 'Rate limit exceeded, please slow down';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;

create trigger messages_rate_limit
  before insert on public.messages
  for each row
  execute function public.check_message_rate_limit();
