-- PREPARED ONLY. Apply only after explicit approval, as one transaction.
begin;

create table if not exists public.profile_timeline_pair_order (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- NULL identifies the older pair stored separately from profile_timeline_pairs.
  pair_id uuid references public.profile_timeline_pairs(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (profile_id, position),
  unique nulls not distinct (profile_id, pair_id)
);
create index if not exists timeline_pair_order_pair_id on public.profile_timeline_pair_order(pair_id);

alter table public.profile_timeline_pair_order enable row level security;
revoke all on public.profile_timeline_pair_order from public, anon, authenticated;
grant select on public.profile_timeline_pair_order to anon, authenticated;
grant insert, delete on public.profile_timeline_pair_order to authenticated;

drop policy if exists timeline_pair_order_read on public.profile_timeline_pair_order;
create policy timeline_pair_order_read on public.profile_timeline_pair_order
for select to anon, authenticated using (
  case when pair_id is null then
    public.owns_profile(profile_id) or exists (
      select 1 from public.profiles p
      where p.id = profile_timeline_pair_order.profile_id
        and p.show_journey and p.then_now is not null
        and public.can_view_profile(p.id)
        and (
          select count(*)
          from public.projects project
          join public.portfolio_categories portal on portal.id = project.category_id and portal.profile_id = project.profile_id
          where project.id::text in (p.then_now->>'then', p.then_now->>'now')
            and project.profile_id = p.id
            and not project.is_hidden and not portal.is_hidden
        ) = 2
    )
  else exists (
    select 1 from public.profile_timeline_pairs pair
    where pair.id = profile_timeline_pair_order.pair_id
      and pair.profile_id = profile_timeline_pair_order.profile_id
  )
  end
);

drop policy if exists timeline_pair_order_insert on public.profile_timeline_pair_order;
create policy timeline_pair_order_insert on public.profile_timeline_pair_order
for insert to authenticated with check (
  public.owns_profile(profile_id)
  and (pair_id is null or exists (
    select 1 from public.profile_timeline_pairs pair
    where pair.id = profile_timeline_pair_order.pair_id
      and pair.profile_id = profile_timeline_pair_order.profile_id
  ))
);

drop policy if exists timeline_pair_order_delete on public.profile_timeline_pair_order;
create policy timeline_pair_order_delete on public.profile_timeline_pair_order
for delete to authenticated using (public.owns_profile(profile_id));

-- A visibility toggle clears the public mirror, so watch the legacy source
-- when it exists. Editing either endpoint keeps the position.
create or replace function public.clear_timeline_legacy_pair_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profile_timeline_pair_order where profile_id = old.profile_id and pair_id is null;
  else
    delete from public.profile_timeline_pair_order where profile_id = old.id and pair_id is null;
  end if;
  return null;
end;
$$;
revoke all on function public.clear_timeline_legacy_pair_order() from public, anon, authenticated;

drop trigger if exists profiles_clear_timeline_legacy_pair_order on public.profiles;
do $$
begin
  if to_regclass('public.profile_journey_pairs') is not null then
    drop trigger if exists profile_journey_clear_timeline_legacy_pair_order on public.profile_journey_pairs;
    create trigger profile_journey_clear_timeline_legacy_pair_order
      after delete on public.profile_journey_pairs
      for each row execute function public.clear_timeline_legacy_pair_order();
  else
    create trigger profiles_clear_timeline_legacy_pair_order
      after update of then_now on public.profiles
      for each row when (old.then_now is not null and new.then_now is null)
      execute function public.clear_timeline_legacy_pair_order();
  end if;
end;
$$;

create or replace function public.save_timeline_pair_order(p_profile_id uuid, p_pair_ids text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare has_legacy boolean;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Only the owner can reorder pairs.' using errcode = '42501';
  end if;
  if p_pair_ids is null or
    cardinality(p_pair_ids) <> (select count(distinct pair_id) from unnest(p_pair_ids) as ids(pair_id))
  then
    raise exception 'Choose distinct pairs.' using errcode = '23514';
  end if;

  -- Two saves for the same profile must each replace a complete order.
  perform 1 from public.profiles where id = p_profile_id for no key update;
  if 'legacy' = any (p_pair_ids) then
    if to_regclass('public.profile_journey_pairs') is not null then
      execute 'select exists (select 1 from public.profile_journey_pairs where profile_id = $1)'
        into has_legacy using p_profile_id;
    else
      select then_now is not null into has_legacy from public.profiles where id = p_profile_id;
    end if;
    if not coalesce(has_legacy, false) then
      raise exception 'This pair is no longer available.' using errcode = '23503';
    end if;
  end if;
  delete from public.profile_timeline_pair_order where profile_id = p_profile_id;
  insert into public.profile_timeline_pair_order(profile_id, pair_id, position)
  select p_profile_id, nullif(pair_id, 'legacy')::uuid, position
  from unnest(p_pair_ids) with ordinality as ids(pair_id, position);
end;
$$;

revoke all on function public.save_timeline_pair_order(uuid, text[]) from public, anon, authenticated;
grant execute on function public.save_timeline_pair_order(uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
commit;
