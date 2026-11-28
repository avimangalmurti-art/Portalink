// Authenticated request/status/cancel for the account deletion lifecycle.
// The database release gate (deletion_private.release_gate) is authoritative;
// ACCOUNT_DELETION_ENABLED=false is an additional emergency stop for new requests.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDeletionHandler } from '../_shared/deletion-request.mjs';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const handle = createDeletionHandler(admin, {
  enabled: Deno.env.get('ACCOUNT_DELETION_ENABLED') !== 'false',
  processImmediately: true,
});

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  const response = await handle(request);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
});
