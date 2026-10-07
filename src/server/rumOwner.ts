type VerifiedUser = { id: string };
type OwnerConfiguration = { ownerProfileId?: string; supabaseUrl: string; publishableKey: string };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const denied = (status: number) => new Response(JSON.stringify({ error: status === 503 ? 'Load timings are unavailable.' : 'Not permitted.' }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

/** Verify the configured portfolio's actual account relation, never editable auth metadata. */
export async function authorizeRumOwner(request: Request, config: OwnerConfiguration,
  authenticate: (request: Request, required: boolean) => Promise<VerifiedUser | null>,
  fetcher: typeof fetch = fetch): Promise<void> {
  const profileId = config.ownerProfileId?.trim();
  if (!profileId || !UUID.test(profileId) || !config.supabaseUrl || !config.publishableKey) throw denied(503);
  const user = await authenticate(request, true);
  const authorization = request.headers.get('authorization');
  if (!user || !UUID.test(user.id) || !authorization) throw denied(403);
  const query = new URLSearchParams({ select: 'id,account_id', id: `eq.${profileId}`, account_id: `eq.${user.id}`, limit: '1' });
  let response: Response;
  try {
    response = await fetcher(`${config.supabaseUrl}/rest/v1/profiles?${query}`, {
      headers: { authorization, apikey: config.publishableKey, accept: 'application/json' },
      redirect: 'manual', signal: AbortSignal.timeout(8_000),
    });
  } catch { throw denied(503); }
  if (!response.ok) throw denied(response.status === 401 ? 401 : 503);
  const records: unknown = await response.json().catch(() => null);
  if (!Array.isArray(records) || records.length !== 1 || records[0]?.id !== profileId || records[0]?.account_id !== user.id) throw denied(403);
}
