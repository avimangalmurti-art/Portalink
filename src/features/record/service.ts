import {requireSupabase} from '../../services/supabase/client';
import type {RecordStatus,OwnerEvent} from './model';
export type RecordApi={status:(profileId:string,signal:AbortSignal,fresh?:boolean)=>Promise<RecordStatus>;event:(profileId:string,event:OwnerEvent['event'],key:string)=>Promise<void>};
async function request(profileId:string,method='GET',body?:unknown,signal?:AbortSignal,fresh=false){
 const client=requireSupabase(),{data,error}=await client.auth.getSession();if(error||!data.session)throw new Error('Sign in to open your record.');const account=data.session.user.id;
 const response=await fetch('/api/studio/record?profile='+encodeURIComponent(profileId)+(fresh?'&fresh=1':''),{method,credentials:'omit',cache:'no-store',signal,headers:{authorization:'Bearer '+data.session.access_token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new Error(response.status===403?'Only the owner can open this record.':'Your record could not load. Please try again.');
 const current=await client.auth.getSession();if(current.data.session?.user.id!==account)throw new Error('Your account changed. Reopen your record.');return response;
}
export const recordApi:RecordApi={async status(id,signal,fresh){const result=await(await request(id,'GET',undefined,signal,fresh)).json() as RecordStatus;if(result.profileId!==id)throw new Error('Invalid record response.');return result;},async event(id,event,key){await request(id,'POST',{event,key});}};
