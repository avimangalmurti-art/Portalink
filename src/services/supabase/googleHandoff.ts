import {requireAdmission,takeGoogleBirthDate} from '../../features/launch/adultLaunch';
import {readSharedReturnPath} from '../../features/auth/registration';
export async function startGoogleHandoff(returnPath?:string):Promise<void> {
 const receipt=requireAdmission();const birthDate=takeGoogleBirthDate();
 const response=await fetch('/api/auth/google/start',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({country:receipt.country,birthDate,termsVersion:receipt.termsVersion,privacyVersion:receipt.privacyVersion,termsAccepted:true,privacyAcknowledged:true,returnPath:readSharedReturnPath(returnPath)}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Google sign-in is unavailable.');const data=await response.json();const url=new URL(data.url);
 if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||url.username||url.password||url.hash||url.searchParams.get('redirect_uri')!==window.location.origin+'/api/auth/google/callback')throw Error('Invalid sign-in destination');
 window.location.assign(url.href);
}
