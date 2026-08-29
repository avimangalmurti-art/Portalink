import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function listPaths(
  client: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  const paths: string[] = [];
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id) {
      paths.push(path);
    } else {
      paths.push(...await listPaths(client, bucket, path));
    }
  }
  return paths;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ message: 'Authentication is required.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const projectUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!projectUrl || !serviceRoleKey) throw new Error('The account service is not configured.');
    const admin = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice('Bearer '.length);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw userError ?? new Error('The session is invalid.');

    const body = await request.json() as { confirmation?: string };
    const email = userData.user.email ?? '';
    if (body.confirmation?.trim().toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ message: 'The confirmation does not match the account email.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await admin.from('profiles').select('id').eq('account_id', userData.user.id).maybeSingle();
    if (profile?.id) {
      const projectPaths = await listPaths(admin, 'project-media', profile.id);
      if (projectPaths.length > 0) {
        const { error } = await admin.storage.from('project-media').remove(projectPaths);
        if (error) throw error;
      }
    }
    const avatarPaths = await listPaths(admin, 'avatars', userData.user.id);
    if (avatarPaths.length > 0) {
      const { error } = await admin.storage.from('avatars').remove(avatarPaths);
      if (error) throw error;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
    if (deleteError) throw deleteError;
    return new Response(JSON.stringify({ isDeleted: true, message: 'Your account and creator data have been deleted.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'The account could not be deleted.';
    return new Response(JSON.stringify({ isDeleted: false, message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
