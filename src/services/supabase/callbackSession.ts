import type { Session, SupabaseClient } from '@supabase/supabase-js';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Exclusive=<T>(operation:()=>T)=>Promise<T>;
/** Session IDs are comparison hints from already verified tokens, never authorization. */
export function sessionId(token:string):string {
 const part=token.split('.')[1];
 const value=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
 if(typeof value.session_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.session_id))throw Error('Session identity unavailable');
 return value.session_id;
}
function storedId(raw:string):string {
 const value=JSON.parse(raw);return sessionId(value.access_token);
}
/** Every main SDK storage mutation uses this same lock, not the ignored SDK lock option. */
export function createCallbackSessionStorage(store:()=>Store|null,key:string,exclusive:Exclusive|null) {
 // Preserve the SDK's ordinary memory fallback when browser storage is blocked.
 const values=new Map<string,string>();
 const memory:Store={getItem:name=>values.get(name)??null,setItem:(name,value)=>{values.set(name,value);},removeItem:name=>{values.delete(name);}};
 const run=<T,>(operation:()=>T):Promise<T>=>exclusive?exclusive(operation):Promise.resolve().then(operation);
 return {
  storage:{
   getItem:(name:string)=>run(()=>(store()??memory).getItem(name)),
   setItem:(name:string,value:string)=>run(()=>(store()??memory).setItem(name,value)),
   removeItem:(name:string)=>run(()=>(store()??memory).removeItem(name)),
  },
  async commit(session:Session,issuedToken:string) {
   if(!exclusive)throw Error('Secure callback storage unavailable');
   const id=sessionId(issuedToken);
   if(sessionId(session.access_token)!==id)throw Error('Session changed during adoption');
   await exclusive(()=>{
    const storage=store();if(!storage)throw Error('Persistent callback storage unavailable');
    const raw=storage.getItem(key);
    // Never overwrite another login, even one which predates this callback.
    if(raw&&storedId(raw)!==id)throw Error('Another sign-in is active');
    storage.setItem(key,JSON.stringify(session));
   });
  },
  async removeIssued(token:string):Promise<boolean> {
   if(!exclusive)return false;
   try {
    const id=sessionId(token);
    await exclusive(()=>{
     const storage=store();if(!storage)throw Error('Persistent callback storage unavailable');
     const raw=storage.getItem(key);
     if(raw&&storedId(raw)===id)storage.removeItem(key);
    });
    return true;
   }catch{return false;}
  },
 };
}
/** Uses an isolated, non-persistent SDK client: no shared SIGNED_IN on failure. */
export async function adoptCallbackSession(auth:Pick<SupabaseClient['auth'],'setSession'>,
 coordinator:ReturnType<typeof createCallbackSessionStorage>,accessToken:string,refreshToken:string,
 onIssued:(token:string)=>void,navigate:()=>void) {
 const id=sessionId(accessToken);
 const {data,error}=await auth.setSession({access_token:accessToken,refresh_token:refreshToken});
 if(error||!data.session)throw Error('Session unavailable');
 if(sessionId(data.session.access_token)!==id)throw Error('Session changed during adoption');
 onIssued(data.session.access_token); // Keep refreshed credentials in memory for exact-session revocation.
 await coordinator.commit(data.session,accessToken);
 navigate();
}

