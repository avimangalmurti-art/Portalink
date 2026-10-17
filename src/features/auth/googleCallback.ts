import {adoptIssuedAuthSession,cleanupIssuedAuthSession} from '../../services/supabase/client';
import {readSharedReturnPath} from './registration';
async function complete() {
 const element=document.getElementById('portalink-google-session');
 const text=element?.textContent;element?.remove();
 let issuedAccessToken:string|undefined;
 try {
  if(!text||text.length>32768)throw Error('Missing completion');
  const value=JSON.parse(text);
  if(typeof value.accessToken==='string'&&value.accessToken)issuedAccessToken=value.accessToken;
  if(typeof value.accessToken!=='string'||typeof value.refreshToken!=='string')throw Error('Invalid completion');
  const destination=new URL('/',window.location.origin);destination.searchParams.set('entry','oauth');
  const path=readSharedReturnPath(value.returnPath);if(path)destination.searchParams.set('onboarding_return',path);
  await adoptIssuedAuthSession(value.accessToken,value.refreshToken,token=>{issuedAccessToken=token;},()=>window.location.replace(destination.href));
 }catch{
  let cleanupPending=Boolean(text);
  if(issuedAccessToken){try{cleanupPending=!await cleanupIssuedAuthSession(issuedAccessToken);}catch{cleanupPending=true;}}
  window.location.replace('/?entry=oauth&error='+(cleanupPending?'oauth_cleanup_pending':'oauth_failed'));
 }
}
void complete();
