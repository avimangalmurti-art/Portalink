-- UNAPPLIED: prepare for separate review and explicit authorization before execution.
-- Retire new repost writes without deleting or invalidating historical rows.
-- Existing tables, policies, grants, likes, saves and comments remain unchanged.
begin;

create or replace function public.guard_retired_project_reposts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind = 'repost' then
    if tg_op = 'INSERT' then
      raise exception using errcode = '23514', message = 'Reposts are no longer supported.';
    elsif old.kind is distinct from new.kind
      or old.account_id is distinct from new.account_id
      or old.project_id is distinct from new.project_id then
      raise exception using errcode = '23514', message = 'Reposts are no longer supported.';
    end if;
  end if;
  return new;
end;
$$;

-- Trigger execution needs no direct client/RPC access to its function.
revoke all on function public.guard_retired_project_reposts() from public, anon, authenticated;

create or replace trigger project_engagement_retired_reposts
before insert or update on public.project_engagement
for each row execute function public.guard_retired_project_reposts();

comment on function public.guard_retired_project_reposts() is
  'Reject new repost rows or identities while preserving historical records and other interaction kinds.';

commit;
