// Retries deletion jobs that stopped at a checkpoint. Service-role callers only
// (scheduler); the database worker gate must also be on.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runDeletionTick } from '../_shared/deletion-worker.mjs';

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return Response.json({ status: 'method_not_allowed' }, { status: 405 });
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!serviceKey || token !== serviceKey) return Response.json({ status: 'unauthorized' }, { status: 401 });
  const results = [];
  for (let i = 0; i < 5; i++) {
    const outcome = await runDeletionTick(admin, { enabled: true });
    results.push(outcome.status);
    if (outcome.status === 'idle' || outcome.status === 'disabled') break;
  }
  return Response.json({ results });
});
