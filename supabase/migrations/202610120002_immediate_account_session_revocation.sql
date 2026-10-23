-- Pending explicit approval. Install only this migration on the existing project.
-- Revoked JWTs must fail before Data API tables, views or SECURITY DEFINER RPCs.
-- Storage and Postgres Changes also need RLS because they bypass PostgREST.
begin;

create function public.is_account_session_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := auth.jwt(); session_id uuid; account_id uuid;
begin
  -- Public visitors and server processing retain their existing permissions.
  if coalesce(claims->>'role', '') <> 'authenticated' then return true; end if;
  begin
    session_id := (claims->>'session_id')::uuid;
    account_id := (claims->>'sub')::uuid;
  exception when invalid_text_representation then return false;
  end;
  return exists (select 1 from auth.sessions s where s.id = session_id
    and s.user_id = account_id and (s.not_after is null or s.not_after > now()));
end;
$$;
revoke all on function public.is_account_session_active() from public;
grant execute on function public.is_account_session_active() to anon, authenticated, service_role;

create function public.require_active_account_session()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not public.is_account_session_active() then
    raise sqlstate 'PT401' using message = 'Account session ended. Sign in again.';
  end if;
end;
$$;
revoke all on function public.require_active_account_session() from public;
grant execute on function public.require_active_account_session() to anon, authenticated, service_role;

-- Never silently replace another request hook. Read-only production preflight
-- found no hook; repeat this check atomically when installing.
do $$
begin
  if exists (select 1 from pg_roles r cross join lateral unnest(r.rolconfig) c
    where r.rolname = 'authenticator' and c like 'pgrst.db_pre_request=%'
      and c <> 'pgrst.db_pre_request=')
    or exists (select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) c
      where (s.setrole = 0 or s.setrole = 'authenticator'::regrole)
        and c like 'pgrst.db_pre_request=%' and c <> 'pgrst.db_pre_request=') then
    raise exception 'Existing Data API request hook must be reviewed before installation.';
  end if;
end;
$$;

-- Additional restrictive policies AND with every existing permissive policy.
-- They never grant access or replace ownership/privacy/participant policies.
do $$
declare target text; relation regclass;
begin
  foreach target in array array[
    'public.citations', 'public.creator_saves', 'public.direct_conversation_reads',
    'public.direct_conversation_states', 'public.direct_conversations',
    'public.direct_message_attachments', 'public.direct_message_blocks',
    'public.direct_message_reactions', 'public.direct_message_reports',
    'public.direct_message_send_events', 'public.direct_messages',
    'public.discovery_preferences', 'public.discovery_signals',
    'public.messaging_preferences', 'public.notifications', 'public.pdf_processing_jobs',
    'public.portfolio_categories', 'public.profile_follows', 'public.profile_handle_aliases',
    'public.profile_handle_check_events', 'public.profile_handle_state',
    'public.profile_journey_pairs', 'public.profiles', 'public.project_attachments',
    'public.project_comments', 'public.project_drafts', 'public.project_engagement',
    'public.project_pages', 'public.projects', 'storage.objects', 'realtime.messages'
  ] loop
    relation := to_regclass(target);
    if relation is null or not (select relrowsecurity from pg_class where oid = relation) then
      raise exception 'Expected protected relation % missing or RLS disabled.', target;
    end if;
    execute format('create policy account_session_active on %s as restrictive for all to authenticated using ((select public.is_account_session_active())) with check ((select public.is_account_session_active()))', relation);
  end loop;
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'public.require_active_account_session';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
