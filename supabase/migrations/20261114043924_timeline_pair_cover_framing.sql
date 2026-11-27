-- Store Then/Now framing on the pair so project covers stay independent.
begin;

create schema if not exists portalink_private;
revoke all on schema portalink_private from public, anon;
grant usage on schema portalink_private to authenticated, service_role;

create function portalink_private.valid_timeline_cover_position(framing jsonb)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(framing) = 'object' then
    framing ?& array['x','y','zoom']
    and framing - 'x' - 'y' - 'zoom' = '{}'::jsonb
    and jsonb_typeof(framing->'x') = 'number' and framing->'x' between '0'::jsonb and '1'::jsonb
    and jsonb_typeof(framing->'y') = 'number' and framing->'y' between '0'::jsonb and '1'::jsonb
    and jsonb_typeof(framing->'zoom') = 'number' and framing->'zoom' between '1'::jsonb and '3'::jsonb
  else false end
$$;
revoke all on function portalink_private.valid_timeline_cover_position(jsonb) from public, anon;
grant execute on function portalink_private.valid_timeline_cover_position(jsonb) to authenticated, service_role;

alter table public.profile_timeline_pairs
  add column then_cover jsonb,
  add column now_cover jsonb,
  add constraint timeline_pair_then_cover_valid check (
    then_cover is null or (
      coalesce(jsonb_typeof(then_cover) = 'object' and then_cover->>'projectId' = then_project_id::text, false)
      and portalink_private.valid_timeline_cover_position(then_cover - 'projectId')
    )
  ),
  add constraint timeline_pair_now_cover_valid check (
    now_cover is null or (
      coalesce(jsonb_typeof(now_cover) = 'object' and now_cover->>'projectId' = now_project_id::text, false)
      and portalink_private.valid_timeline_cover_position(now_cover - 'projectId')
    )
  );

grant update (then_cover, now_cover) on public.profile_timeline_pairs to authenticated;

-- An older client can replace a side without sending the new cover fields.
create function portalink_private.clear_replaced_timeline_cover()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.then_project_id <> old.then_project_id and new.then_cover is not distinct from old.then_cover then
    new.then_cover := null;
  end if;
  if new.now_project_id <> old.now_project_id and new.now_cover is not distinct from old.now_cover then
    new.now_cover := null;
  end if;
  return new;
end
$$;
revoke all on function portalink_private.clear_replaced_timeline_cover() from public, anon, authenticated;

create trigger timeline_pair_clear_replaced_cover
before update of then_project_id, now_project_id on public.profile_timeline_pairs
for each row execute function portalink_private.clear_replaced_timeline_cover();

-- The first pair still lives in the owner-only legacy store. Use its existing
-- validation, project locks and public opt-in mirror.
create or replace function public.validate_journey_pair() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare
  then_id uuid;
  now_id uuid;
  found_count integer;
  previous_pair jsonb;
  then_frame jsonb;
  now_frame jsonb;
begin
  if tg_op = 'INSERT' then
    if new.then_now is not null then
      raise exception 'Create the profile before choosing a Then/Now pair.' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.then_now is null then
    delete from public.profile_journey_pairs where profile_id = new.id;
    return new;
  end if;
  if jsonb_typeof(new.then_now) is distinct from 'object'
    or not (new.then_now ?& array['then','now'])
    or (new.then_now - 'then' - 'now' - 'thenCover' - 'nowCover') <> '{}'::jsonb
    or jsonb_typeof(new.then_now->'then') is distinct from 'string'
    or jsonb_typeof(new.then_now->'now') is distinct from 'string' then
      raise exception 'Choose exactly two projects for Then/Now.' using errcode = '23514';
  end if;
  begin
    then_id := (new.then_now->>'then')::uuid;
    now_id := (new.then_now->>'now')::uuid;
  exception when invalid_text_representation then
    raise exception 'Choose valid projects for Then/Now.' using errcode = '23514';
  end;
  if then_id = now_id then
    raise exception 'Then and Now must be different projects.' using errcode = '23514';
  end if;
  perform p.id from public.projects p
  join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
  where p.id = any(array[then_id, now_id]) and p.profile_id = new.id and not p.is_hidden and not c.is_hidden
  order by p.id for share of p, c;
  get diagnostics found_count = row_count;
  if found_count <> 2 then
    raise exception 'Choose two visible projects from your own portfolio.' using errcode = '23514';
  end if;

  select pair into previous_pair from public.profile_journey_pairs where profile_id = new.id;
  then_frame := case
    when new.then_now ? 'thenCover' then nullif(new.then_now->'thenCover', 'null'::jsonb)
    when previous_pair->>'then' = then_id::text then previous_pair->'thenCover'
  end;
  now_frame := case
    when new.then_now ? 'nowCover' then nullif(new.then_now->'nowCover', 'null'::jsonb)
    when previous_pair->>'now' = now_id::text then previous_pair->'nowCover'
  end;
  if (then_frame is not null and not portalink_private.valid_timeline_cover_position(then_frame))
    or (now_frame is not null and not portalink_private.valid_timeline_cover_position(now_frame)) then
      raise exception 'Invalid Then/Now cover framing.' using errcode = '23514';
  end if;
  new.then_now := jsonb_build_object('then', then_id::text, 'now', now_id::text);
  if then_frame is not null then
    new.then_now := new.then_now || jsonb_build_object('thenCover', then_frame);
  end if;
  if now_frame is not null then
    new.then_now := new.then_now || jsonb_build_object('nowCover', now_frame);
  end if;

  insert into public.profile_journey_pairs(profile_id, pair) values (new.id, new.then_now)
  on conflict (profile_id) do update set pair = excluded.pair;
  if not new.show_journey then new.then_now := null; end if;
  return new;
end
$$;
revoke all on function public.validate_journey_pair() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
