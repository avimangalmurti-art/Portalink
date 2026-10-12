-- Review only. No citation rows, notification triggers or Cited-in counts.
begin;
create table public.external_references (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 owner_profile_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('doi','url','isbn','text')),
 raw_input text not null check(char_length(raw_input) between 1 and 16000),
 resolved jsonb not null check(jsonb_typeof(resolved)='object'),
 created_at timestamptz not null default now()
);
create index external_references_project_created_idx on public.external_references(project_id,created_at);
alter table public.external_references enable row level security;
revoke all on public.external_references from public,anon,authenticated;
grant select on public.external_references to anon,authenticated;
grant insert,update,delete on public.external_references to authenticated;
create policy external_reference_read on public.external_references for select to anon,authenticated using (
 exists(select 1 from public.projects p where p.id=project_id)
);
create policy external_reference_insert on public.external_references for insert to authenticated with check (
 public.owns_profile(owner_profile_id) and exists(select 1 from public.projects p where p.id=project_id and p.profile_id=owner_profile_id)
);
create policy external_reference_update on public.external_references for update to authenticated using(public.owns_profile(owner_profile_id)) with check (
 public.owns_profile(owner_profile_id) and exists(select 1 from public.projects p where p.id=project_id and p.profile_id=owner_profile_id)
);
create policy external_reference_delete on public.external_references for delete to authenticated using(public.owns_profile(owner_profile_id));
-- created_at is server-stamped on insert and immutable on edit. Client-supplied
-- owner ids must still match the canonical project under its existing SELECT RLS.
create function public.stamp_external_reference() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.created_at:=now();else new.created_at:=old.created_at;end if;
 return new;
end;
$$;
revoke all on function public.stamp_external_reference() from public,anon,authenticated;
create trigger stamp_external_reference before insert or update on public.external_references for each row execute function public.stamp_external_reference();
commit;
