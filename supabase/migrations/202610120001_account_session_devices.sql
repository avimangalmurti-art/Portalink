-- Awaiting explicit production SQL approval. Apply only this file, once.
-- No auth tables are exposed or altered. These two narrow RPCs use Auth's
-- existing session records; no passwords, tokens, IP addresses or account IDs
-- are returned. Auth's own LogoutSession removes the same auth.sessions row.
begin;

create function public.list_my_account_sessions(p_before timestamptz default null, p_before_id uuid default null)
returns table (id uuid, user_agent text, created_at timestamptz, refreshed_at timestamptz, is_current boolean)
language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
declare caller uuid := auth.uid(); current_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if caller is null or current_session is null or not exists (
    select 1 from auth.sessions s where s.id = current_session and s.user_id = caller
    and (s.not_after is null or s.not_after > now())
  ) then raise exception 'An active sign-in session is required.' using errcode = '42501'; end if;
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields are required.' using errcode = '22023';
  end if;
  return query select s.id, left(s.user_agent, 512), s.created_at::timestamptz,
    s.refreshed_at::timestamptz, s.id = current_session
    from auth.sessions s where s.user_id = caller and (s.not_after is null or s.not_after > now())
    and (p_before is null or (s.created_at, s.id) < (p_before, p_before_id))
    order by s.created_at desc, s.id desc limit 51;
end;
$$;

create function public.revoke_my_account_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare caller uuid := auth.uid(); current_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid; removed uuid;
begin
  if caller is null or current_session is null then
    raise exception 'An active sign-in session is required.' using errcode = '42501';
  end if;
  -- Prevent a concurrent logout from invalidating the checked caller mid-write.
  perform 1 from auth.sessions s where s.id = current_session and s.user_id = caller
    and (s.not_after is null or s.not_after > now()) for share;
  if not found then raise exception 'An active sign-in session is required.' using errcode = '42501'; end if;
  if p_session_id is null or p_session_id = current_session then
    raise exception 'Use local sign-out for this session.' using errcode = '22023';
  end if;
  delete from auth.sessions s where s.id = p_session_id and s.user_id = caller returning s.id into removed;
  return removed is not null;
end;
$$;

revoke all on function public.list_my_account_sessions(timestamptz, uuid) from public, anon;
revoke all on function public.revoke_my_account_session(uuid) from public, anon;
grant execute on function public.list_my_account_sessions(timestamptz, uuid) to authenticated;
grant execute on function public.revoke_my_account_session(uuid) to authenticated;
commit;
