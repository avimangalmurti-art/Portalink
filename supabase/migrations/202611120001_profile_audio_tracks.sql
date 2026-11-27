-- Pending production review. Keep the audio and cover private in Storage so
-- changing profile visibility or disabling a track prevents new viewer URLs.
begin;

create table public.profile_audio_tracks (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) <= 120 and btrim(title) <> ''),
  artist text not null default '' check (char_length(artist) <= 120),
  description text not null default '' check (char_length(description) <= 600),
  enabled boolean not null default true,
  audio_path text not null check (audio_path ~ (
    '^' || profile_id::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/audio[.](mp3|m4a|mp4|wav|ogg|oga|opus|webm|weba|flac)$'
  )),
  cover_path text check (cover_path ~ (
    '^' || profile_id::text || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/cover[.](jpg|jpeg|png|webp)$'
  )),
  revision uuid not null default gen_random_uuid()
);

alter table public.profile_audio_tracks enable row level security;
revoke all on public.profile_audio_tracks from public, anon, authenticated;
grant select on public.profile_audio_tracks to anon, authenticated;
grant insert, update, delete on public.profile_audio_tracks to authenticated;

create policy profile_audio_tracks_read on public.profile_audio_tracks
  for select to anon, authenticated
  using (
    (select public.owns_profile(profile_id))
    or (enabled and exists (
      select 1 from public.profiles as profile
      where profile.id = profile_audio_tracks.profile_id and profile.is_private is false
    ))
  );

create policy profile_audio_tracks_owner_insert on public.profile_audio_tracks
  for insert to authenticated with check ((select public.owns_profile(profile_id)));

create policy profile_audio_tracks_owner_update on public.profile_audio_tracks
  for update to authenticated
  using ((select public.owns_profile(profile_id)))
  with check ((select public.owns_profile(profile_id)));

create policy profile_audio_tracks_owner_delete on public.profile_audio_tracks
  for delete to authenticated using ((select public.owns_profile(profile_id)));

-- Fail if the bucket already exists so a conflicting visibility configuration
-- cannot be accepted silently when this transaction is applied.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-audio', 'profile-audio', false, 52428800, array[
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/flac',
  'image/jpeg', 'image/png', 'image/webp'
]);

create policy profile_audio_files_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'profile-audio' and (
      (select public.owns_profile(public.path_profile_id(name)))
      or exists (
        -- The metadata SELECT policy enforces public-profile visibility here.
        select 1 from public.profile_audio_tracks as track
        where track.profile_id = public.path_profile_id(storage.objects.name)
          and track.enabled and storage.objects.name in (track.audio_path, track.cover_path)
      )
    )
  );

-- Media is immutable. Uploads use a fresh UUID and never overwrite old bytes.
create policy profile_audio_files_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-audio'
    and (select public.owns_profile(public.path_profile_id(name)))
    and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/(audio[.](mp3|m4a|mp4|wav|ogg|oga|opus|webm|weba|flac)|cover[.](jpg|jpeg|png|webp))$'
  );

create policy profile_audio_files_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-audio'
    and (select public.owns_profile(public.path_profile_id(name)))
    and not exists (
      select 1 from public.profile_audio_tracks as track
      where track.profile_id = public.path_profile_id(storage.objects.name)
        and storage.objects.name in (track.audio_path, track.cover_path)
    )
  );

commit;
