import {requireSupabase} from './client';
import {requireAdmission, takeGoogleBirthDate as takeTransientBirthDate, LAUNCH_REVIEW_VERSION} from '../../features/launch/adultLaunch';

async function currentAccount(accountId:string) {
  const client=requireSupabase();
  const {data,error}=await client.auth.getUser();
  if(error||!data.user?.email_confirmed_at||data.user.id!==accountId)throw Error('Sign in to this confirmed account again.');
  return client;
}
export async function getLaunchCompletion(accountId:string):Promise<'ready'|'required'|'reauthenticate'|'unavailable'> {
  const client=await currentAccount(accountId);
  // New Google/email receipts work in controlled testing without opening legacy email admission.
  const receipt=await client.rpc('verify_adult_launch_receipt',{p_terms_version:LAUNCH_REVIEW_VERSION,p_privacy_version:LAUNCH_REVIEW_VERSION});
  await currentAccount(accountId);
  if(!receipt.error&&receipt.data?.verified===true)return 'ready';
  const {data,error}=await client.rpc('legacy_email_launch_status');
  await currentAccount(accountId);
  if(error||!data||!['ready','required','reauthenticate'].includes(data.status)
   ||data.terms_version!==LAUNCH_REVIEW_VERSION||data.privacy_version!==LAUNCH_REVIEW_VERSION)return 'unavailable';
  return data.status;
}
export async function completeLaunchEligibility(accountId:string):Promise<void> {
  const admission=requireAdmission();
  const birthDate=takeTransientBirthDate();
  const client=await currentAccount(accountId);
  const {data,error}=await client.rpc('complete_legacy_email_launch',{p_expected_account:accountId,p_country:admission.country,p_birth_date:birthDate,
    p_terms_version:admission.termsVersion,p_privacy_version:admission.privacyVersion,p_terms_accepted:true,p_privacy_acknowledged:true});
  await currentAccount(accountId);
  if(error||data?.verified!==true)throw Error('Eligibility completion could not be verified. Check eligibility and sign in again if needed.');
  if(await getLaunchCompletion(accountId)!=='ready')throw Error('Your account completion could not be verified.');
}
