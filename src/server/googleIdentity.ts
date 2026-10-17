/** Verify Google's signed identity before admitting it to the existing Supabase project. */
export async function sha256(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function randomSecret(): string { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export async function pkceChallenge(verifier: string): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(value:string): Uint8Array { if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid identity'); return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); }
export async function boundedJson(response:Response,limit=65536): Promise<Record<string,unknown>> {
  if(!response.ok || !response.body)throw Error('Unavailable');
  const reader=response.body.getReader();let length=0;const chunks:Uint8Array[]=[];
  try { for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit)throw Error('Response too large');chunks.push(part.value);} }
  finally { await reader.cancel().catch(()=>undefined);reader.releaseLock(); }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Invalid response');return value as Record<string,unknown>;
}
export async function verifyGoogleIdentity(token:string,clientId:string,nonceHash:string,fetcher:typeof fetch=fetch,now=Date.now()) {
  if(token.length>16384)throw Error('Invalid identity');const parts=token.split('.');if(parts.length!==3)throw Error('Invalid identity');
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256)throw Error('Invalid identity');
  const aud=claims.aud;
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)
   || !(aud===clientId || (Array.isArray(aud)&&aud.includes(clientId)&&claims.azp===clientId))
   || (claims.azp!==undefined&&claims.azp!==clientId)
   || !Number.isFinite(claims.exp)||claims.exp<=now/1000||!Number.isFinite(claims.iat)||claims.iat>now/1000+60||claims.iat<now/1000-600
   || claims.nonce!==nonceHash || claims.email_verified!==true || typeof claims.email!=='string'||claims.email.length>320
   || typeof claims.sub!=='string'||!/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub))throw Error('Invalid identity');
  const jwks=await boundedJson(await fetcher('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:AbortSignal.timeout(8000)}));
  const keys=jwks.keys;if(!Array.isArray(keys))throw Error('Invalid identity');
  const candidates=keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(candidates.length!==1)throw Error('Invalid identity');
  const key=await crypto.subtle.importKey('jwk',candidates[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]).slice().buffer,new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('Invalid identity');
  return {subject:claims.sub as string,email:claims.email as string};
}
