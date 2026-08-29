-- A private, durable Home objective chosen by the account holder.
-- The product stores a plain mode, not editable ranking coefficients.

create table if not exists public.discovery_preferences (
  account_id uuid primary key references auth.users(id) on delete cascade,
  home_mode text not null default 'balanced' check (home_mode in ('balanced','following','nearby','latest')),
  updated_at timestamptz not null default now()
);

alter table public.discovery_preferences enable row level security;
drop policy if exists discovery_preferences_owner_select on public.discovery_preferences;
drop policy if exists discovery_preferences_owner_insert on public.discovery_preferences;
drop policy if exists discovery_preferences_owner_update on public.discovery_preferences;
drop policy if exists discovery_preferences_owner_delete on public.discovery_preferences;
create policy discovery_preferences_owner_select on public.discovery_preferences for select to authenticated
using (account_id = (select auth.uid()));
create policy discovery_preferences_owner_insert on public.discovery_preferences for insert to authenticated
with check (account_id = (select auth.uid()));
create policy discovery_preferences_owner_update on public.discovery_preferences for update to authenticated
using (account_id = (select auth.uid())) with check (account_id = (select auth.uid()));
create policy discovery_preferences_owner_delete on public.discovery_preferences for delete to authenticated
using (account_id = (select auth.uid()));

grant select, insert, update, delete on public.discovery_preferences to authenticated;
