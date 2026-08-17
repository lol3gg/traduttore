-- Rolling 7-day retention: messages expire 7 days after they were sent.
create extension if not exists pg_cron;

create or replace function public.purge_old_messages()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.messages
  where created_at < now() - interval '7 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_old_messages() from public;
grant execute on function public.purge_old_messages() to postgres, service_role;

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'purge-old-messages'
  ) then
    perform cron.unschedule('purge-old-messages');
  end if;
end $$;

select cron.schedule(
  'purge-old-messages',
  '*/20 * * * *',
  $$select public.purge_old_messages()$$
);

select public.purge_old_messages();
