-- PENDING / NOT APPLIED. Explicit approval required. Preserve all legacy handles.
begin;
alter table public.profiles add column if not exists handle text;
create table if not exists public.profile_handle_state (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 confirmed_at timestamptz, shared_at timestamptz
);
alter table public.profile_handle_state enable row level security;
revoke all on public.profile_handle_state from public,anon,authenticated;
alter table public.profiles drop constraint if exists profiles_handle_check;
-- Old underscore/hyphen handles can remain unchanged. New values use the trigger below.
create unique index if not exists profiles_handle_lower_unique on public.profiles(lower(handle));
create table if not exists public.profile_handle_aliases (
 handle text primary key, profile_id uuid not null references public.profiles(id) on delete cascade,
 expires_at timestamptz not null
);
create index if not exists profile_handle_aliases_expiry on public.profile_handle_aliases(expires_at);
alter table public.profile_handle_aliases enable row level security;
revoke all on public.profile_handle_aliases from public, anon, authenticated;
create table if not exists public.profile_handle_check_events (key text not null, at timestamptz not null default now());
create index if not exists profile_handle_check_events_time on public.profile_handle_check_events(at);
alter table public.profile_handle_check_events enable row level security;
revoke all on public.profile_handle_check_events from public, anon, authenticated;
create or replace function public.valid_public_handle(value text) returns boolean language sql immutable set search_path = public as $$
 select coalesce(value ~ '^[a-z0-9][a-z0-9.]{2,29}$' and not value = any(ARRAY['share','p','studio','messages','settings','search','portalink','api','media','feed','discover','profile','item','portals','insights','appearance','saved','notifications','assets','icons','startup','c','collaboration','activity','edit','home','index.html','share.html','favicon.ico','og.png','image.png','image-dark.png','site.webmanifest','robots.txt','sitemap.xml','manifest.json','sw.js','portalink-welcome-loop.webp','portalink-splash-mobile.mp4']), false);
$$;
create or replace function public.protect_profile_handle() returns trigger language plpgsql security definer set search_path = public as $$
begin
 -- One namespace lock across direct profile writes and all RPCs; never a check-then-insert race.
 perform pg_advisory_xact_lock(hashtextextended('portalink.profile-handles', 0));
 if TG_OP = 'UPDATE' and new.handle is not distinct from old.handle then return new; end if;
 if not public.valid_public_handle(new.handle) then raise exception 'invalid public handle' using errcode='23514'; end if;
 delete from public.profile_handle_aliases where expires_at <= now();
 if exists(select 1 from public.profiles p where lower(p.handle)=new.handle and p.id<>new.id)
 or exists(select 1 from public.profile_handle_aliases a where a.handle=new.handle and a.profile_id<>new.id)
 then raise exception 'handle already taken' using errcode='23505'; end if;
 delete from public.profile_handle_aliases where handle=new.handle and profile_id=new.id;
 if TG_OP='UPDATE' then
   if exists(select 1 from public.profile_handle_state where profile_id=old.id and shared_at is not null) and public.valid_public_handle(old.handle) then
     insert into public.profile_handle_aliases(handle,profile_id,expires_at) values(old.handle,old.id,now()+interval '90 days')
     on conflict(handle) do update set expires_at=excluded.expires_at;
   end if;
   insert into public.profile_handle_state(profile_id,confirmed_at,shared_at) values(new.id,now(),null)
   on conflict(profile_id) do update set confirmed_at=now(),shared_at=null;
 end if;
 return new;
end;
$$;
drop trigger if exists protect_profile_handle on public.profiles;
create trigger protect_profile_handle before insert or update of handle on public.profiles for each row execute function public.protect_profile_handle();
create or replace function public.profile_handle_available(p_handle text) returns jsonb language plpgsql security definer set search_path = public as $$
declare caller text; headers jsonb;
begin
 -- Same transaction-lock + event-count pattern as message send throttling.
 -- Anonymous callers share a daily, hashed forwarded-IP budget; no raw IP is retained.
 headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 caller := md5(current_date::text || ':' || coalesce(auth.uid()::text,split_part(headers->>'x-forwarded-for',',',1),'anonymous'));
 perform pg_advisory_xact_lock(hashtextextended(caller, 1));
 delete from public.profile_handle_check_events where at < now()-interval '1 day';
 if (select count(*) from public.profile_handle_check_events where key=caller and at>now()-interval '1 minute') >= 30
 then return jsonb_build_object('available',false,'limited',true); end if;
 insert into public.profile_handle_check_events(key) values(caller);
 return jsonb_build_object('available',public.valid_public_handle(p_handle)
   and not exists(select 1 from public.profiles where lower(handle)=p_handle)
   and not exists(select 1 from public.profile_handle_aliases where handle=p_handle and expires_at>now()));
end;
$$;
create or replace function public.claim_profile_handle(p_profile_id uuid,p_handle text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('portalink.profile-handles',0));
 if not exists(select 1 from public.profiles where id=p_profile_id and account_id=auth.uid()) then raise exception 'permission denied'; end if;
 if not public.valid_public_handle(p_handle) then raise exception 'invalid public handle'; end if;
 update public.profiles set handle=p_handle where id=p_profile_id;
 insert into public.profile_handle_state(profile_id,confirmed_at) values(p_profile_id,now())
 on conflict(profile_id) do update set confirmed_at=coalesce(profile_handle_state.confirmed_at,now());
 return jsonb_build_object('handle',p_handle,'confirmed',true);
end;
$$;
create or replace function public.mark_profile_handle_shared(p_profile_id uuid,p_handle text) returns boolean language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('portalink.profile-handles',0));
 -- Reserve at the user's explicit Copy/Send/Save QR action BEFORE handing it off.
 -- A cancelled external sheet conservatively keeps the alias safe; no recipient/delivery tracking.
 update public.profile_handle_state s set shared_at=coalesce(s.shared_at,now())
 where s.profile_id=p_profile_id and s.confirmed_at is not null and exists(select 1 from public.profiles p where p.id=p_profile_id and p.account_id=auth.uid() and p.handle=p_handle and not p.is_private);
 if not found then raise exception 'address changed or portfolio is private; reopen Share'; end if;
 return true;
end;
$$;
create or replace function public.profile_share_address(p_profile_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
 select jsonb_build_object('handle',case when public.valid_public_handle(p.handle) and s.confirmed_at is not null then p.handle else null end,'confirmed',s.confirmed_at is not null)
 from public.profiles p left join public.profile_handle_state s on s.profile_id=p.id where p.id=p_profile_id and (not p.is_private or p.account_id=auth.uid());
$$;
create or replace function public.resolve_profile_handle(p_handle text) returns jsonb language sql stable security definer set search_path = public as $$
 select jsonb_build_object('profileId',p.id,'handle',p.handle,'alias',p.handle<>p_handle)
 from public.profiles p join public.profile_handle_state s on s.profile_id=p.id where not p.is_private and s.confirmed_at is not null and public.valid_public_handle(p.handle)
 and (p.handle=p_handle or exists(select 1 from public.profile_handle_aliases a where a.profile_id=p.id and a.handle=p_handle and a.expires_at>now())) limit 1;
$$;
revoke all on function public.protect_profile_handle() from public,anon,authenticated;
revoke all on function public.valid_public_handle(text) from public,anon,authenticated;
revoke all on function public.profile_handle_available(text), public.profile_share_address(uuid), public.resolve_profile_handle(text), public.claim_profile_handle(uuid,text), public.mark_profile_handle_shared(uuid,text) from public,anon,authenticated;
grant execute on function public.profile_handle_available(text), public.profile_share_address(uuid), public.resolve_profile_handle(text) to anon,authenticated;
grant execute on function public.claim_profile_handle(uuid,text), public.mark_profile_handle_shared(uuid,text) to authenticated;
commit;
