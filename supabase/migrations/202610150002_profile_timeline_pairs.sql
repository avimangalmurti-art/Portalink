-- UNAPPLIED: additional Then/Now pairs. Existing profile.then_now stays untouched.
begin;
create table public.profile_timeline_pairs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  then_project_id uuid not null references public.projects(id) on delete cascade,
  now_project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint timeline_pair_distinct check (then_project_id <> now_project_id),
  constraint timeline_pair_unique unique (profile_id, then_project_id, now_project_id)
);
create index profile_timeline_pairs_order on public.profile_timeline_pairs(profile_id, created_at, id);
alter table public.profile_timeline_pairs enable row level security;
revoke all on public.profile_timeline_pairs from public, anon, authenticated;
grant select on public.profile_timeline_pairs to anon, authenticated;
grant insert, delete on public.profile_timeline_pairs to authenticated;

-- Invoker context and existing RLS apply throughout. No private project is revealed.
create policy timeline_pairs_read on public.profile_timeline_pairs for select to anon, authenticated using (
  public.owns_profile(profile_id) or (
    public.can_view_profile(profile_id)
    and exists (select 1 from public.profiles p where p.id=profile_timeline_pairs.profile_id and p.show_journey)
    and exists (select 1 from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
      where p.id=then_project_id and p.profile_id=profile_timeline_pairs.profile_id and not p.is_hidden and not c.is_hidden)
    and exists (select 1 from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
      where p.id=now_project_id and p.profile_id=profile_timeline_pairs.profile_id and not p.is_hidden and not c.is_hidden)
  )
);
create policy timeline_pairs_add on public.profile_timeline_pairs for insert to authenticated with check (
  public.owns_profile(profile_id)
  and exists (select 1 from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
    where p.id=then_project_id and p.profile_id=profile_timeline_pairs.profile_id and not p.is_hidden and not c.is_hidden)
  and exists (select 1 from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
    where p.id=now_project_id and p.profile_id=profile_timeline_pairs.profile_id and not p.is_hidden and not c.is_hidden)
);
create policy timeline_pairs_remove on public.profile_timeline_pairs for delete to authenticated using (public.owns_profile(profile_id));
commit;
