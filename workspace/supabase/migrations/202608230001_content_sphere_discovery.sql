-- Portalink content-sphere discovery v1.
-- Coarse content relevance is distinct from profile/home geography; no precise
-- coordinates, movement history, inferred sensitive traits, or click events are stored.

alter table public.projects add column if not exists topic_keys text[] not null default '{}';
alter table public.projects add column if not exists content_location text not null default '';
alter table public.projects add column if not exists geographic_scope text not null default 'location_independent';
alter table public.projects add column if not exists geography_confidence real not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_content_location_length') then
    alter table public.projects add constraint projects_content_location_length check (char_length(content_location) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_geographic_scope_valid') then
    alter table public.projects add constraint projects_geographic_scope_valid check (
      geographic_scope in ('local','city','regional','national','global','location_independent')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_geography_confidence_range') then
    alter table public.projects add constraint projects_geography_confidence_range check (geography_confidence between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_topic_keys_limit') then
    alter table public.projects add constraint projects_topic_keys_limit check (cardinality(topic_keys) <= 12);
  end if;
end $$;

create index if not exists projects_topic_keys_idx on public.projects using gin(topic_keys);
create index if not exists projects_content_location_idx on public.projects(lower(content_location));

create table if not exists public.discovery_signals (
  account_id uuid not null references auth.users(id) on delete cascade,
  topic_key text not null check (char_length(topic_key) between 2 and 48),
  interest_weight real not null default 0 check (interest_weight between 0 and 12),
  curiosity_weight real not null default 0 check (curiosity_weight between 0 and 12),
  last_interest_at timestamptz,
  last_curiosity_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, topic_key)
);

alter table public.discovery_signals enable row level security;
drop policy if exists discovery_signals_owner_select on public.discovery_signals;
drop policy if exists discovery_signals_owner_insert on public.discovery_signals;
drop policy if exists discovery_signals_owner_update on public.discovery_signals;
drop policy if exists discovery_signals_owner_delete on public.discovery_signals;
create policy discovery_signals_owner_select on public.discovery_signals for select to authenticated
using (account_id = (select auth.uid()));
create policy discovery_signals_owner_insert on public.discovery_signals for insert to authenticated
with check (account_id = (select auth.uid()));
create policy discovery_signals_owner_update on public.discovery_signals for update to authenticated
using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
create policy discovery_signals_owner_delete on public.discovery_signals for delete to authenticated
using (account_id = (select auth.uid()));
grant select, insert, update, delete on public.discovery_signals to authenticated;

-- Overload the existing publishing function so old clients remain compatible.
-- Calling the original overload inside this transaction keeps publication and
-- relevance metadata atomic.
create or replace function public.publish_project(
  p_draft_id uuid,
  p_profile_id uuid,
  p_category_id uuid,
  p_title text,
  p_summary text,
  p_attachments jsonb,
  p_topic_keys text[],
  p_content_location text,
  p_geographic_scope text,
  p_geography_confidence real
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_project_id uuid;
begin
  if cardinality(coalesce(p_topic_keys, '{}')) > 12 then raise exception 'too many topics'; end if;
  if coalesce(p_geographic_scope, 'location_independent') not in ('local','city','regional','national','global','location_independent') then
    raise exception 'invalid geographic scope';
  end if;
  new_project_id := public.publish_project(
    p_draft_id, p_profile_id, p_category_id, p_title, p_summary, p_attachments
  );
  update public.projects set
    topic_keys = coalesce(p_topic_keys, '{}'),
    content_location = left(coalesce(p_content_location, ''), 80),
    geographic_scope = coalesce(p_geographic_scope, 'location_independent'),
    geography_confidence = greatest(0, least(1, coalesce(p_geography_confidence, 0)))
  where id = new_project_id and profile_id = p_profile_id;
  return new_project_id;
end;
$$;

revoke all on function public.publish_project(uuid,uuid,uuid,text,text,jsonb,text[],text,text,real) from public;
grant execute on function public.publish_project(uuid,uuid,uuid,text,text,jsonb,text[],text,text,real) to authenticated;

create or replace function public.record_discovery_signal(
  p_topic_keys text[],
  p_signal_kind text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  topic text;
  normalized_topic text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_signal_kind not in ('interest','curiosity') then raise exception 'invalid signal kind'; end if;
  if cardinality(coalesce(p_topic_keys, '{}')) > 12 then raise exception 'too many topics'; end if;

  foreach topic in array coalesce(p_topic_keys, '{}')
  loop
    normalized_topic := left(regexp_replace(lower(trim(topic)), '[^a-z0-9-]+', '-', 'g'), 48);
    if char_length(normalized_topic) < 2 then continue; end if;
    insert into public.discovery_signals(
      account_id, topic_key, interest_weight, curiosity_weight,
      last_interest_at, last_curiosity_at, updated_at
    ) values (
      (select auth.uid()), normalized_topic,
      case when p_signal_kind = 'interest' then 1 else 0 end,
      case when p_signal_kind = 'curiosity' then 1 else 0 end,
      case when p_signal_kind = 'interest' then now() else null end,
      case when p_signal_kind = 'curiosity' then now() else null end,
      now()
    )
    on conflict (account_id, topic_key) do update set
      interest_weight = least(12, public.discovery_signals.interest_weight + case when p_signal_kind = 'interest' then 1 else 0 end),
      curiosity_weight = least(12, public.discovery_signals.curiosity_weight + case when p_signal_kind = 'curiosity' then 1 else 0 end),
      last_interest_at = case when p_signal_kind = 'interest' then now() else public.discovery_signals.last_interest_at end,
      last_curiosity_at = case when p_signal_kind = 'curiosity' then now() else public.discovery_signals.last_curiosity_at end,
      updated_at = now();
  end loop;
end;
$$;

revoke all on function public.record_discovery_signal(text[],text) from public;
grant execute on function public.record_discovery_signal(text[],text) to authenticated;
