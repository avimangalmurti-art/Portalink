-- PREPARED ONLY. Requires explicit approval before applying.
-- Optional project-level author context. Existing owner/public/private RLS stays intact.
begin;
do $context$
declare introduced boolean := not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='story_answers');
begin
alter table public.projects
  add column if not exists made_in text,
  add column if not exists field text,
  add column if not exists story_answers jsonb;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_made_in_month') then
alter table public.projects add constraint projects_made_in_month
  check (made_in is null or made_in ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
end if;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_field_length') then
alter table public.projects add constraint projects_field_length
  check (field is null or char_length(field) <= 120);
end if;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_story_answers_shape') then
alter table public.projects add constraint projects_story_answers_shape
  check (story_answers is null or (
    jsonb_typeof(story_answers) = 'object'
    and story_answers - 'what' - 'did' - 'learned' = '{}'::jsonb
    and (not story_answers ? 'what' or (jsonb_typeof(story_answers->'what') = 'string' and char_length(story_answers->>'what') <= 20000))
    and (not story_answers ? 'did' or (jsonb_typeof(story_answers->'did') = 'string' and char_length(story_answers->>'did') <= 20000))
    and (not story_answers ? 'learned' or (jsonb_typeof(story_answers->'learned') = 'string' and char_length(story_answers->>'learned') <= 20000))
  ));
end if;
-- Copy source-only compatibility data; retain JSON for older readers/bundle RPCs.
if introduced then
update public.projects set
  made_in = nullif(design->'projectContext'->>'madeIn', ''),
  field = nullif(design->'projectContext'->>'field', ''),
  story_answers = design->'projectContext'->'answers'
where jsonb_typeof(design->'projectContext') = 'object'
  and made_in is null and field is null and story_answers is null;
end if;
end $context$;
commit;
