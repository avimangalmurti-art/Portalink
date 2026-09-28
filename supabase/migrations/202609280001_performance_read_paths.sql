-- Additive read indexes and equivalent, indexable private Storage predicates.
-- No bucket exposure, data rewrite, worker protocol or audience change.
begin;

create index if not exists profile_follows_follower_profile_target_status_idx
  on public.profile_follows (follower_profile_id, target_profile_id, status);
create index if not exists direct_message_blocks_blocked_profile_idx on public.direct_message_blocks (blocked_profile_id);
create index if not exists direct_conversations_pending_initiator_idx
  on public.direct_conversations (initiator_profile_id) where established_at is null and status = 'request';
create index if not exists project_comments_author_idx on public.project_comments (author_profile_id);
create index if not exists project_comments_parent_idx on public.project_comments (parent_id);
create index if not exists project_comments_root_idx on public.project_comments (root_id);
create index if not exists project_drafts_profile_idx on public.project_drafts (profile_id);
create index if not exists direct_message_reactions_profile_idx on public.direct_message_reactions (profile_id);
create index if not exists direct_conversation_reads_profile_idx on public.direct_conversation_reads (profile_id);
create index if not exists direct_conversation_states_profile_idx on public.direct_conversation_states (profile_id);
create index if not exists notifications_conversation_idx on public.notifications (conversation_id);
create index if not exists notifications_actor_profile_idx on public.notifications (actor_profile_id);
create index if not exists projects_profile_position_idx on public.projects (profile_id, position);
create index if not exists direct_messages_conversation_sender_created_idx
  on public.direct_messages (conversation_id, sender_profile_id, created_at desc);
create index if not exists pdf_jobs_processing_lease_idx
  on public.pdf_processing_jobs (lease_expires_at) where status = 'processing';

-- Cast the path, not indexed UUID columns. Invalid paths simply fail access.
create or replace function public.storage_path_uuid(object_name text, segment integer)
returns uuid language plpgsql immutable strict set search_path = public as $$
begin
  if segment < 1 then return null; end if;
  -- Match the previous foldername predicates: the basename is not a folder.
  return (storage.foldername(object_name))[segment]::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function public.storage_path_uuid(text, integer) from public;
grant execute on function public.storage_path_uuid(text, integer) to anon, authenticated, service_role;

drop policy if exists project_media_pdf_page_read on storage.objects;
create policy project_media_pdf_page_read on storage.objects for select to anon, authenticated
using (bucket_id = 'project-media' and (storage.foldername(name))[1] = 'posts'
  and exists (select 1 from public.projects p
    where p.id = public.storage_path_uuid(storage.objects.name, 2)
      and (public.owns_profile(p.profile_id) or (not p.is_hidden and public.can_view_profile(p.profile_id)))));

drop policy if exists message_media_insert_own on storage.objects;
create policy message_media_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'message-media' and public.owns_profile(public.storage_path_uuid(name, 1))
  and exists (select 1 from public.direct_conversations conversation
    where conversation.id = public.storage_path_uuid(storage.objects.name, 2)
      and public.can_interact_direct_conversation(conversation.id) and conversation.status = 'active'));

drop policy if exists message_media_delete_own on storage.objects;
create policy message_media_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'message-media' and public.owns_profile(public.storage_path_uuid(name, 1)));

-- Optimize only an already-installed video pipeline. Some deployments have no
-- job table; this migration must not install/backfill it or change its policies.
do $$ begin
  if to_regclass('public.video_processing_jobs') is not null then
    create index if not exists video_jobs_project_idx on public.video_processing_jobs (project_id);
    create index if not exists video_jobs_completed_output_idx
      on public.video_processing_jobs (output_path) where status = 'completed';
    create index if not exists video_jobs_processing_lease_idx
      on public.video_processing_jobs (lease_expires_at) where status = 'processing';

    -- Jobs already have caller RLS. Keep it and the project visibility guard.
    -- Only canonical six-digit parts resolve to an output: no broad LIKE prefix.
    drop policy if exists project_media_video_read on storage.objects;
    create policy project_media_video_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'project-media' and exists (
      select 1 from public.video_processing_jobs j join public.projects p on p.id = j.project_id
      where j.status = 'completed'
        and j.output_path = regexp_replace(storage.objects.name, '\.parts/[0-9]{6}$', '')
        and (public.owns_profile(p.profile_id) or (not p.is_hidden and public.can_view_profile(p.profile_id)))
    ));
  end if;
end $$;

-- Always validate new attachments. Playback/cover metadata updates need not
-- re-count every original part; changed/removed multipart specs still validate.
drop trigger if exists project_attachments_validate_multipart on public.project_attachments;
drop trigger if exists project_attachments_validate_multipart_insert on public.project_attachments;
drop trigger if exists project_attachments_validate_multipart_update on public.project_attachments;
create trigger project_attachments_validate_multipart_insert
before insert on public.project_attachments for each row
execute function public.validate_multipart_attachment();
create trigger project_attachments_validate_multipart_update
before update of storage_path, size_bytes, metadata on public.project_attachments
for each row when (
  old.storage_path is distinct from new.storage_path
  or old.size_bytes is distinct from new.size_bytes
  or (old.metadata -> 'multipart') is distinct from (new.metadata -> 'multipart')
) execute function public.validate_multipart_attachment();

commit;
