/** Revoke only the session represented by this attempt's issued token.
 * No account IDs, shared browser session, global logout, persistence or logging.
 * A successful logout revokes refresh capability; existing JWTs can live to expiry.
 */
export async function revokeIssuedSession(supabaseUrl:string,publishableKey:string,accessToken:string,fetcher:typeof fetch=fetch):Promise<boolean> {
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)||!publishableKey||!accessToken||accessToken.length>16384||/\s/.test(accessToken))return false;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const result=await fetcher(supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
    headers:{apikey:publishableKey,authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(3000)});
   await result.body?.cancel().catch(()=>undefined);
   if(result.ok)return true;
  }catch{/* Unconfirmed revocation gets one bounded retry; never widen its scope. */}
 }
 return false;
}
