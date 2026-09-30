-- PENDING. Apply ONLY after revised cover_thumbnail_schema.sql AND project_covers_public_bucket.sql.
-- This capability prevents new social writes against old manifest/storage policies.
begin;
create or replace function public.project_cover_social_supported() returns boolean language sql stable security invoker set search_path=pg_catalog as $$ select true; $$;
revoke all on function public.project_cover_social_supported() from public,anon;
grant execute on function public.project_cover_social_supported() to authenticated,service_role;
commit;
