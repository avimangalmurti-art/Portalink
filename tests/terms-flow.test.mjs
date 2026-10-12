import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
import {hookHarness,deferred} from './helpers/hook-harness.mjs';
const model=sourceModule('src/features/legal/model.ts');
const docs=model.LEGAL_KEYS.map(key=>({key,version:'1.0',title:key,markdown_body:'[DRAFT — not yet reviewed by counsel]',effective_at:'2026-10-12T00:00:00Z'}));
const versions=docs.map(({key,version})=>({key,version}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Create account waits for terms; Disagree creates no account/session and Agree carries the correct versions',async()=>{
  for(const choice of [null,versions]){
    const consent=deferred(),calls=[];
    const auth={signUp:async input=>{calls.push(input);return{email:input.email,requiresEmailVerification:true,session:null};}};
    const h=hookHarness(new URL('../src/features/auth/useAuthFlows.ts',import.meta.url),'useSignUp',{auth},{refreshSession:()=>assert.fail('Unconfirmed signup must not establish a session')},{},undefined,{
      '../legal/signupTermsContext':{useSignupTerms:()=>({requestConsent:()=>consent.promise})},'./registration':{},
    });
    const pending=h.value.submit('owner@example.test','synthetic-password');await tick();assert.equal(calls.length,0);
    consent.resolve(choice);await pending;await h.flush();assert.equal(calls.length,choice===null?0:1);
    if(choice)assert.equal(JSON.stringify(calls[0].legalVersions),JSON.stringify(versions));
    h.dispose();
  }
});
function coordinator(){
  const slots=[],effects=[];let cursor=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((item,i)=>Object.is(item,b[i]));
  const react={...React,
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useMemo(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});},
    useLayoutEffect(fn,deps){return react.useEffect(fn,deps);},
  };
  const state={account:null,documents:structuredClone(docs),history:[],writes:[],staged:null,signouts:[],paths:[],location:{pathname:'/',search:''},fail:false};
  const auth={get user(){return state.account?{id:state.account}:null;},get isAuthenticated(){return Boolean(state.account);},async signOut(scope){state.signouts.push(scope);state.account=null;return true;}};
  const legal={documents:async()=>state.documents,acceptances:async()=>state.history,signupConsent:async()=>state.staged,
    async accept(accountId,input){if(state.fail)throw Error('Write failed');state.writes.push({accountId,input});state.history=input.map(row=>({...row,accepted_at:'2026-10-12T00:00:00Z'}));},sendEmail:async()=> 'Sent'};
  const {TermsProvider}=sourceModule('src/features/legal/TermsContext.tsx',{
    './useRequiredTermsBackGuard':{useRequiredTermsBackGuard:()=>async()=>{}},
    react,'react-router-dom':{useLocation:()=>state.location,useNavigate:()=>()=>{}},'../../contexts/AuthContext':{useAuth:()=>auth},'../../contexts/ServicesContext':{useServices:()=>({legal})},'./model':model,'./TermsSheet':{TermsSheet:'sheet'},'./signupTermsContext':{SignupTermsContext:React.createContext(null)},'../../components/ui/PortalinkSplashLoader':{PortalinkSplashLoader:'existing-loader'},
  },{Error,document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}},window:{setInterval(){return 1;},clearInterval(){},addEventListener(){},removeEventListener(){},location:{assign:path=>state.paths.push(path)}}});
  const render=()=>{cursor=0;const tree=TermsProvider({children:'unchanged-app'});effects.splice(0).forEach(fn=>fn());return tree;};
  const sheet=()=>React.Children.toArray(render().props.children).find(child=>child.type==='sheet');
  const flush=async()=>{for(let i=0;i<8;i++){render();await tick();}return sheet();};
  return{state,render,sheet,flush};
}
test('sheet is shown after signup submission, cannot continue until Agree, and Disagree returns to welcome with no session',async()=>{
  const h=coordinator();assert.equal(h.sheet(),undefined);
  const consent=h.render().props.value.requestConsent('owner@example.test');assert.ok(h.sheet());await h.flush();
  h.sheet().props.onDisagree();assert.equal(await consent,null);assert.deepEqual(h.state.signouts,[]);assert.deepEqual(h.state.paths,['/?welcome=1']);
});
test('same version stays closed, one bumped agreement reopens, and successful Agree writes the exact current snapshot',async()=>{
  const h=coordinator();h.state.account='owner';h.state.history=versions.map(row=>({...row,accepted_at:'2026-10-12T00:00:00Z'}));
  await h.flush();assert.equal(h.sheet(),undefined);assert.equal(h.state.writes.length,0);
  h.state.documents=h.state.documents.map(row=>row.key==='privacy'?{...row,version:'1.1'}:row);
  h.state.location={pathname:'/settings',search:'?terms=1'};await h.flush();assert.equal(h.sheet().props.readOnly,false);
  assert.match(h.sheet().props.error,/agreement changed/i);h.sheet().props.onRetry();await h.flush();
  h.sheet().props.onAgree();await h.flush();assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].input.find(row=>row.key==='privacy').version,'1.1');assert.equal(h.sheet().props.readOnly,true);
});
test('confirmed signup flushes only its already-agreed versions; write failure or a version bump never silently continues',async()=>{
  const h=coordinator();h.state.account='owner';h.state.staged=versions;await h.flush();assert.equal(h.sheet(),undefined);assert.equal(h.state.writes.length,1);
  const bumped=coordinator();bumped.state.account='owner';bumped.state.staged=versions;bumped.state.documents=bumped.state.documents.map(row=>({...row,version:'1.1'}));await bumped.flush();assert.ok(bumped.sheet());assert.equal(bumped.state.writes.length,0);
  const failed=coordinator();failed.state.account='owner';failed.state.staged=versions;failed.state.fail=true;await failed.flush();assert.ok(failed.sheet());assert.match(failed.sheet().props.error,/Write failed/);
});
test('effective version selection ignores future documents and orders numeric versions correctly',()=>{
  const rows=[...docs,{...docs[0],version:'1.10'},{...docs[0],version:'1.2'},{...docs[1],version:'9.0',effective_at:'2099-01-01'}];
  const current=model.latestLegalDocuments(rows,Date.parse('2026-10-12T01:00:00Z'));assert.equal(current[0].version,'1.10');assert.equal(current[1].version,'1.0');
  assert.equal(model.needsTermsAcceptance(docs,versions),false);assert.equal(model.needsTermsAcceptance(current,versions),true);
});
test('an account change cancels a pending signup review without carrying its consent to another account',async()=>{
  const h=coordinator();const pending=h.render().props.value.requestConsent('first@example.test');await h.flush();
  h.state.account='different-account';await h.flush();assert.equal(await pending,null);assert.equal(h.state.writes.length,0);
});
