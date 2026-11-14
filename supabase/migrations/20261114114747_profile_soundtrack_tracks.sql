-- Keep the original track, storage paths, revision and policies. Each new
-- track gets its own identity and joins the end of the profile soundtrack.
begin;

alter table public.profile_audio_tracks
  add column id uuid not null default gen_random_uuid(),
  add column created_at timestamptz not null default clock_timestamp(),
  drop constraint profile_audio_tracks_pkey,
  add primary key (id),
  add constraint profile_audio_tracks_profile_revision_key unique (profile_id, revision);

create index profile_audio_tracks_profile_queue_idx
  on public.profile_audio_tracks (profile_id, created_at, id);

-- The server assigns the immutable identity and queue position. Creator
-- writes still use the existing owner RLS policies and media path checks.
revoke insert, update on public.profile_audio_tracks from authenticated;
grant insert (profile_id, title, artist, description, enabled, audio_path, cover_path, revision)
  on public.profile_audio_tracks to authenticated;
grant update (title, artist, description, enabled, audio_path, cover_path, revision)
  on public.profile_audio_tracks to authenticated;

notify pgrst, 'reload schema';

commit;
