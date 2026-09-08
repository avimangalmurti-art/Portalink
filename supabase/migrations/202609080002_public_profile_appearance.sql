-- Add creator branding to the existing public profile. Existing owner-only
-- UPDATE and public/private SELECT policies apply unchanged.
begin;
alter table public.profiles add column if not exists public_appearance jsonb;
do $$ begin
if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_public_appearance_valid') then
alter table public.profiles add constraint profiles_public_appearance_valid check (
  public_appearance is null or (
    jsonb_typeof(public_appearance) = 'object'
    and public_appearance ?& array['accentColor', 'systemGray', 'mode']
    and public_appearance - array['accentColor', 'systemGray', 'mode'] = '{}'::jsonb
    and jsonb_typeof(public_appearance->'accentColor') = 'string'
    and (public_appearance->>'accentColor') ~ '^#[0-9a-fA-F]{6}$'
    and (public_appearance->>'systemGray') in ('gray','gray2','gray3','gray4','gray5','gray6')
    and (public_appearance->>'mode') in ('auto','light','dark')
    and public_appearance->'systemGray' <> 'null'::jsonb
    and public_appearance->'mode' <> 'null'::jsonb
  )
);
end if;
end $$;
comment on column public.profiles.public_appearance is
  'Creator accent, system gray and initial theme for public websites. Visitor theme overrides stay local.';
notify pgrst, 'reload schema';
commit;
