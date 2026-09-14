// Release lock: intentionally no SDK, credentials, database or Storage access.
// Review docs/account-deletion-safety.md before replacing this disabled wrapper.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  return Response.json({ isDeleted: false, message: 'Account deletion is temporarily disabled. No deletion was started.' }, {
    status: request.method === 'POST' ? 503 : 405, headers,
  });
});
