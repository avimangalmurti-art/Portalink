const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATH = '/api/internal/account-deletion/d1';
const PURPOSE = `portalink-account-deletion-d1:v1\nPOST\n${PATH}\n`;
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
const canonical = manifest => ({ version: 1, jobId: manifest.jobId, accountId: manifest.accountId, ownedProjectIds: [...manifest.ownedProjectIds].sort() });
export async function deletionManifestDigest(manifest) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(manifest)))));
}

// Dedicated, purpose-scoped HMAC only. Never pass a Supabase service credential.
export function createD1DeletionAdapter({ url, secret, fetchImpl = fetch, now = () => Date.now() } = {}) {
  let endpoint;
  try { endpoint = new URL(url); } catch { endpoint = null; }
  const isConfigured=Boolean(endpoint && endpoint.protocol === 'https:' && endpoint.pathname === PATH && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password
    && typeof secret === 'string' && /^[0-9a-f]{64}$/.test(secret));
  return Object.assign(async manifest => {
    if (!isConfigured) throw new Error('D1 deletion is not configured');
    if (!manifest || manifest.version !== 1 || !UUID.test(manifest.jobId ?? '') || !UUID.test(manifest.accountId ?? '')
      || !Array.isArray(manifest.ownedProjectIds) || manifest.ownedProjectIds.length>1000
      || new Set(manifest.ownedProjectIds).size !== manifest.ownedProjectIds.length || manifest.ownedProjectIds.some(id => !UUID.test(id))) {
      throw new Error('D1 deletion manifest is invalid');
    }
    const issuedAt = Math.floor(now()/1000);
    if (!Number.isSafeInteger(issuedAt)) throw new Error('D1 deletion clock is unavailable');
    const body = JSON.stringify({ ...canonical(manifest), issuedAt, expiresAt: issuedAt+300 });
    if (new TextEncoder().encode(body).length>65536) throw new Error('D1 deletion manifest is too large');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
    const signature = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(PURPOSE+body)));
    const response = await fetchImpl(endpoint.toString(), { method:'POST', headers:{ 'content-type':'application/json', 'x-portalink-deletion-signature':signature },
      body, signal:AbortSignal.timeout(10_000), redirect:'error' });
    if (!response.ok || !response.body) throw new Error('D1 deletion needs retry');
    const reader = response.body.getReader(); const chunks=[]; let size=0;
    try {
      let finished=false;
      while (!finished) { const {done,value}=await reader.read(); finished=done; if(done)break; size+=value.byteLength;
        if(size>4096)throw new Error('D1 deletion response is invalid'); chunks.push(value); }
    } finally { await reader.cancel().catch(()=>{ /* No response content is retained after cleanup. */ }); }
    const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.byteLength;}
    let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('D1 deletion response is invalid');}
    const digest = await deletionManifestDigest(manifest);
    if (result?.completed !== true || result.jobId !== manifest.jobId || result.manifestDigest !== digest) throw new Error('D1 deletion needs retry');
    return { completed:true, jobId:manifest.jobId, manifestDigest:digest };
  },{isConfigured});
}
