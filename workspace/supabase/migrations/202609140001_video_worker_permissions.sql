-- Remove direct browser-role grants left by Supabase's default function privileges.
begin;

revoke all on function public.enqueue_video_attachment(),
  public.claim_video_processing_job(integer), public.heartbeat_video_processing(uuid, uuid),
  public.complete_video_processing(uuid, uuid, text, integer, integer, double precision, bigint, jsonb),
  public.fail_video_processing(uuid, uuid, text, boolean), public.retry_video_processing(text)
  from public, anon, authenticated;

grant execute on function public.claim_video_processing_job(integer), public.heartbeat_video_processing(uuid, uuid),
  public.complete_video_processing(uuid, uuid, text, integer, integer, double precision, bigint, jsonb),
  public.fail_video_processing(uuid, uuid, text, boolean) to service_role;
grant execute on function public.retry_video_processing(text) to authenticated;

notify pgrst, 'reload schema';
commit;
