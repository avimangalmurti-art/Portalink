import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const pageSize = 500;
type Admin = Pick<ReturnType<typeof createClient>, 'storage'>;

function response(status: number, message: string, isDeleted = false) {
  return Response.json({ isDeleted, message }, { status, headers: corsHeaders });
}

async function allRows<T>(page: (start: number, end: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await page(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data) throw new Error('Account data could not be read.');
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function listPaths(client: Admin, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data) throw new Error('Uploaded files could not be read.');
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await listPaths(client, bucket, path));
    }
    if (data.length < pageSize) return paths;
  }
}

async function removePaths(admin: Admin, bucket: string, paths: string[]) {
  const unique = [...new Set(paths)];
  for (let index = 0; index < unique.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(index, index + 100));
    if (error) throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, 'Use POST to request account deletion.');
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) {
    return response(401, 'Sign in again before deleting your account.');
  }

  let removalStarted = false;
  try {
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!projectUrl || !serviceRoleKey) return response(503, 'Account deletion is temporarily unavailable.');
    const admin = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The account is always derived from a live, server-verified user token.
    // No account ID or storage prefix from the request is ever trusted.
    const { data: userData, error: userError } = await admin.auth.getUser(authorization.slice(7));
    if (userError || !userData.user) return response(401, 'Sign in again before deleting your account.');
    const user = userData.user;
    let body: unknown;
    try { body = await request.json(); } catch { return response(400, 'Confirm your account email address.'); }
    const confirmation = body && typeof body === 'object' && 'confirmation' in body ? body.confirmation : null;
    if (typeof confirmation !== 'string' || !user.email?.trim() ||
      confirmation.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return response(400, 'The confirmation does not match your account email address.');
    }

    // Discover the complete cleanup plan before the first destructive call.
    // Any failed ownership query stops deletion instead of silently skipping data.
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id').eq('account_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    const projectPaths: string[] = [];
    const messagePaths: string[] = [];
    const projectIds: string[] = [];
    if (profile?.id) {
      const projects = await allRows<{ id: string }>((start, end) => admin.from('projects')
        .select('id').eq('profile_id', profile.id).order('id').range(start, end));
      projectIds.push(...projects.map((project) => project.id));
      projectPaths.push(...await listPaths(admin, 'project-media', profile.id));
      // PDF workers store rendered pages outside the uploader's profile folder.
      for (const project of projects) {
        projectPaths.push(...await listPaths(admin, 'project-media', `posts/${project.id}`));
      }
      messagePaths.push(...await listPaths(admin, 'message-media', profile.id));
      const conversations = await allRows<{ id: string }>((start, end) => admin.from('direct_conversations')
        .select('id').or(`participant_one_profile_id.eq.${profile.id},participant_two_profile_id.eq.${profile.id}`)
        .order('id').range(start, end));
      // Existing database cascades remove whole conversations, including both
      // participants' attachments. Collect those exact paths before the cascade.
      for (let offset = 0; offset < conversations.length; offset += 100) {
        const ids = conversations.slice(offset, offset + 100).map((row) => row.id);
        const attachments = await allRows<{ storage_path: string }>((start, end) => admin.from('direct_message_attachments')
          .select('storage_path,direct_messages!inner(conversation_id)')
          .in('direct_messages.conversation_id', ids).order('id').range(start, end));
        messagePaths.push(...attachments.map((row) => row.storage_path));
      }
    }
    const avatarPaths = await listPaths(admin, 'avatars', user.id);

    // Storage must be cleared before deleting its owning Auth user. These APIs
    // aren't one transaction; retries tolerate already removed objects.
    removalStarted = true;
    // Stop outstanding PDF work before the final output scan. Workers reject
    // missing jobs during progress/completion and roll back their late uploads.
    for (let offset = 0; offset < projectIds.length; offset += 100) {
      const { error } = await admin.from('pdf_processing_jobs').delete()
        .in('post_id', projectIds.slice(offset, offset + 100)).in('status', ['queued', 'processing']);
      if (error) throw error;
    }
    for (const id of projectIds) {
      projectPaths.push(...await listPaths(admin, 'project-media', `posts/${id}`));
    }
    await removePaths(admin, 'project-media', projectPaths);
    await removePaths(admin, 'message-media', messagePaths);
    await removePaths(admin, 'avatars', avatarPaths);
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return response(200, 'Your account and its Portalink content have been permanently deleted.', true);
  } catch {
    return response(500, removalStarted
      ? 'Deletion could not be completed. Some files may already have been removed. Please try again.'
      : 'Deletion could not start. Your account has not been deleted. Please try again.');
  }
});
