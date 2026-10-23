import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
const messageImports={react:React,'react-router-dom':{Link:'link'},'../../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworks.com'},'../../features/sharing/shareModel':compile('../src/features/sharing/shareModel.ts',{})};
function compile(file,mocks,extra='') {
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText+extra,{exports,require:n=>mocks[n]??{},URL,Error});return exports;
}
function harness(conversation={id:'thread',status:'active'},send=async()=>({id:'message'}),{presentation='web',inline=false,keyboard=false}={}) {
 let cursor=0,keyboardOpen=keyboard;const slots=[],calls=[],keyboardCalls=[],scrollBoundaryCalls=[];
 const react={...React,useEffect(){},useLayoutEffect(){},useRef:v=>slots[cursor++]??={current:v},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],next=>{slots[i]=next;}];}};
 const {dialog}=compile('../src/features/sharing/InternalContentShare.tsx',{react,
 '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'viewer',isAuthenticated:true})},
 '../../contexts/ServicesContext':{useServices:()=>({messaging:{getOrCreateConversation:async id=>{calls.push(['recipient',id]);return conversation;},sendMessage:async(...args)=>{calls.push(['send',...args]);return send();}}})},
 '../../components/messages/NewChatPanel':{NewChatPanel:'recipients'},'../../components/ui/ModalPortal':{ModalPortal:'portal'},
 '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},
 '../../presentation/motion/useSheetMotion':{useSheetMotion:onClose=>({closing:false,close:after=>after?after():onClose(),finish:onClose})},'../../presentation/motion/motion':{reducedMotion:()=>false},
 '../../presentation/usePresentation':{usePresentation:()=>presentation},'./useRecipientKeyboard':{useRecipientKeyboard:enabled=>{keyboardCalls.push(enabled);return enabled&&keyboardOpen;}},'./useRecipientScrollBoundary':{useRecipientScrollBoundary:enabled=>scrollBoundaryCalls.push(enabled)},
 'lucide-react':{ArrowLeftIcon:'back-icon'},'../../components/ui/InterfaceIcon':{InterfaceIcon:'interface-icon'},
 },'\nexports.dialog=InternalContentShareDialog;');
 const render=()=>{cursor=0;return dialog({target:{title:'Project',url:'https://portalink.test/p/creator/c/portal/work',onSent:()=>calls.push(['confirmed'])},onClose:()=>calls.push(['close']),inline});};
 const button=label=>nodes(render()).find(n=>n.type==='button'&&n.props.children===label);
 const select=(id='recipient')=>nodes(render()).find(n=>n.type==='recipients').props.onSelectCreator(id);
 return {render,button,select,calls,keyboardCalls,scrollBoundaryCalls,setKeyboard:open=>{keyboardOpen=open;}};
}
test('internal sharing requires recipient selection and explicit Send, and confirms only successful sends',async()=>{
 let complete;const h=harness(undefined,()=>new Promise(resolve=>{complete=resolve;}));
 assert.equal(h.button('Send').props.disabled,true);h.select();assert.deepEqual(h.calls,[]);
 const send=h.button('Send');const pending=send.props.onClick();send.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.filter(c=>c[0]==='send').length,1);assert.equal(h.button('Cancel').props.disabled,true);
 assert.equal(h.calls.some(c=>c[0]==='confirmed'),false);
 complete({id:'message'});await pending;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.at(-1)[0],'confirmed');assert.ok(h.button('Done'));
 assert.deepEqual(h.calls.find(c=>c[0]==='send').slice(1),['thread','Project\nhttps://portalink.test/p/creator/c/portal/work']);
});
test('an unaccepted existing invitation blocks internal sending and keeps the error visible',async()=>{
 const h=harness({id:'thread',status:'request',requestedByViewer:true,hasSentRequest:true});h.select();h.button('Send').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.some(c=>c[0]==='send'),false);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));
});
test('received project links open inside Portalink while outside URLs stay text',()=>{
 const {messageContentParts}=compile('../src/components/messages/MessageBody.tsx',messageImports);
 const parts=messageContentParts('Work\nhttps://portalink.test/p/creator/c/portal/work?attachment=file#page-2 https://outside.test/p/creator/c/portal/work','https://portalink.test');
 assert.equal(parts.find(p=>p.to).to,'/p/creator/c/portal/work?attachment=file#page-2');assert.equal(parts.filter(p=>p.to).length,1);
});

test('official and existing legacy portfolio messages use canonical visible links without rewriting stored text',()=>{
 const {messageContentParts}=compile('../src/components/messages/MessageBody.tsx',messageImports);
 const source='https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/portalite/c/design/work?media=a%2Fb&page=2#page-2';
 const part=messageContentParts(source,'https://preview.example').find(part=>part.to);
 assert.equal(part.to,'/portalite/c/design/work?media=a%2Fb&page=2#page-2');
 assert.equal(part.text,'https://portalinknetworks.com/portalite/c/design/work?media=a%2Fb&page=2#page-2');
 assert.equal(source.includes('.chatgpt.site/'),true);
 assert.equal(messageContentParts('https://portalinknetworks.com/portalite','https://preview.example').find(part=>part.to).to,'/portalite');
 for(const url of ['https://outside.test/portalite','https://portalinknetworksinc.avimangalmurti566055.chatgpt.site.evil.test/portalite','https://person:secret@portalinknetworks.com/portalite']) assert.equal(messageContentParts(url,'https://preview.example').some(part=>part.to),false);
});
test('sharing uses an opaque full-screen recipient search with Back and explicit Send',()=>{
 const h=harness();const tree=nodes(h.render());
 assert.ok(tree.some(n=>n.props.className==='internal-share-screen'));
 assert.equal(tree.some(n=>(n.props.className??'').includes('modal-scrim')),false);
 assert.equal(tree.find(n=>n.type==='recipients').props.appearance,'account-search');
 const back=tree.find(n=>n.type==='button'&&n.props['aria-label']==='Back');
 back.props.onClick();assert.deepEqual(h.calls,[['close']]);
 assert.equal(h.button('Send').props.disabled,true);
});

test('mobile recipient typing removes footer actions, preserves selection and restores explicit sending after keyboard dismissal',async()=>{
 const h=harness(undefined,undefined,{presentation:'mobile'});
 assert.ok(h.button('Cancel'));assert.equal(h.button('Send').props.disabled,true);
 h.setKeyboard(true);
 let tree=nodes(h.render());
 assert.equal(h.button('Cancel'),undefined);assert.equal(h.button('Send'),undefined);
 assert.equal(tree.some(n=>n.type==='footer'),false,'Removing the whole empty footer releases its space to results');
 assert.ok(tree.find(n=>n.type==='button'&&n.props['aria-label']==='Back'));
 h.select();
 assert.equal(nodes(h.render()).find(n=>n.type==='recipients').props.selectedCreatorId,'recipient');
 assert.deepEqual(h.calls,[],'Choosing a recipient while typing never sends automatically');
 h.setKeyboard(false);
 assert.ok(h.button('Cancel'));assert.equal(h.button('Send').props.disabled,false);
 assert.equal(nodes(h.render()).find(n=>n.type==='recipients').props.selectedCreatorId,'recipient');
 h.button('Send').props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.filter(call=>call[0]==='send').length,1);
 assert.ok(h.button('Done'));
 assert.equal(h.keyboardCalls.at(-1),false,'Successful sending disables recipient keyboard detection');
});

test('MOBILE keeps the selected directory and changes Sending to confirmed Sent without reopening another send',async()=>{
 let complete;const h=harness(undefined,()=>new Promise(resolve=>{complete=resolve;}),{presentation:'mobile'});
 h.select();
 const originalDirectory=nodes(h.render()).find(n=>n.type==='recipients'),staleSend=h.button('Send');
 staleSend.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.button('Sending…').props.disabled,true);
 assert.equal(h.button('Sent'),undefined,'An unresolved message must not claim delivery');
 assert.equal(nodes(h.render()).find(n=>n.type==='recipients').props.startingCreatorId,'recipient');
 complete({id:'message'});await new Promise(resolve=>setImmediate(resolve));
 const tree=nodes(h.render()),retainedDirectory=tree.find(n=>n.type==='recipients'),sent=h.button('Sent');
 assert.equal(tree.find(n=>n.type==='h1').props.children,'Send content');
 assert.equal(retainedDirectory.key,originalDirectory.key);
 assert.equal(retainedDirectory.props.selectedCreatorId,'recipient');
 assert.equal(retainedDirectory.props.startingCreatorId,null,'Confirmed recipients must stop showing Sending');
 assert.equal(retainedDirectory.props.disabled,true);
 assert.equal(sent.props.disabled,true);
 assert.equal(sent.props['data-send-state'],'sent');
 assert.equal(sent.props['data-semantic-action'],'send');
 assert.ok(tree.some(n=>n.props.role==='status'&&n.props.children==='Sent in Portalink.'));
 assert.ok(h.button('Done'));assert.equal(h.button('Cancel'),undefined);
 staleSend.props.onClick();originalDirectory.props.onSelectCreator('different-recipient');sent.props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.calls.filter(c=>c[0]==='send').length,1,'Stale or repeated actions cannot send a second message');
 assert.equal(h.calls.filter(c=>c[0]==='confirmed').length,1);
 assert.equal(nodes(h.render()).find(n=>n.type==='recipients').props.selectedCreatorId,'recipient');
 h.button('Done').props.onClick();assert.equal(h.calls.at(-1)[0],'close');
});

test('MOBILE send failures keep the selected directory actionable until an explicit retry succeeds',async()=>{
 let attempts=0,complete;const h=harness(undefined,()=>++attempts===1?Promise.reject(new Error('Connection interrupted')):new Promise(resolve=>{complete=resolve;}),{presentation:'mobile'});
 h.select();const originalDirectory=nodes(h.render()).find(n=>n.type==='recipients');
 h.button('Send').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 let tree=nodes(h.render()),directory=tree.find(n=>n.type==='recipients');
 assert.equal(tree.find(n=>n.props.role==='alert').props.children,'Connection interrupted');
 assert.equal(h.button('Send').props.disabled,false);assert.equal(h.button('Sent'),undefined);assert.equal(h.button('Done'),undefined);
 assert.equal(directory.key,originalDirectory.key);assert.equal(directory.props.selectedCreatorId,'recipient');assert.equal(directory.props.disabled,false);
 assert.equal(h.calls.some(c=>c[0]==='confirmed'),false);
 h.button('Send').props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.button('Sending…').props.disabled,true);assert.equal(nodes(h.render()).some(n=>n.props.role==='alert'),false);
 assert.equal(h.calls.filter(c=>c[0]==='send').length,2);
 complete({id:'retried-message'});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.button('Sent').props.disabled,true);assert.equal(h.calls.filter(c=>c[0]==='confirmed').length,1);
});

test('mobile Back remains available while typing and a sending error remains visible without the hidden actions',async()=>{
 const h=harness(undefined,async()=>{throw new Error('Synthetic send failure');},{presentation:'mobile'});
 h.select();h.button('Send').props.onClick();
 await new Promise(resolve=>setImmediate(resolve));
 h.setKeyboard(true);
 const tree=nodes(h.render());
 assert.equal(h.button('Cancel'),undefined);assert.equal(h.button('Send'),undefined);
 assert.equal(tree.find(n=>n.props.role==='alert').props.children,'Synthetic send failure');
 assert.ok(tree.some(n=>n.type==='footer'),'The existing error is retained when actions are hidden');
 assert.equal(tree.some(n=>n.props.role==='status'&&n.props.children==='Recipient selected'),false);
 const back=tree.find(n=>n.type==='button'&&n.props['aria-label']==='Back');
 assert.equal(back.props.disabled,false);back.props.onClick();
 assert.equal(h.calls.at(-1)[0],'close');
});

test('WEB and inline sharing keep their actions without enabling the mobile modal keyboard behavior',()=>{
 for(const options of [{presentation:'web'},{presentation:'mobile',inline:true},{presentation:'web',inline:true}]){
  const h=harness(undefined,undefined,{...options,keyboard:true});
  assert.ok(h.button('Cancel'));assert.equal(h.button('Send').props.disabled,true);
  assert.equal(h.keyboardCalls.at(-1),false);
  h.select();assert.equal(h.button('Send').props.disabled,false);
  assert.deepEqual(h.calls,[]);
 }
});

test('WEB and inline successful sends retain their existing separate confirmation view',async()=>{
 for(const options of [{presentation:'web'},{presentation:'mobile',inline:true},{presentation:'web',inline:true}]){
  const h=harness(undefined,undefined,options);h.select();h.button('Send').props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const tree=nodes(h.render());
  assert.equal(tree.find(n=>n.type==='h1').props.children,'Sent');
  assert.equal(tree.some(n=>n.type==='recipients'),false);
  assert.ok(tree.some(n=>n.props.className==='internal-share-feedback'&&n.props.children==='Sent in Portalink.'));
  assert.ok(h.button('Done'));assert.equal(h.button('Sent'),undefined);
 }
});

test('MOBILE provider creates a fresh recipient session while retaining one send lock across reopenings',()=>{
 for(const presentation of ['mobile','web']){
  const slots=[];let cursor=0;
  const react={...React,useEffect(){},useRef:value=>slots[cursor++]??={current:value},useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=value;}];}};
  const api=compile('../src/features/sharing/InternalContentShare.tsx',{react,'../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'viewer',isAuthenticated:true})},'../../presentation/usePresentation':{usePresentation:()=>presentation}});
  const render=()=>{cursor=0;return api.InternalContentShareProvider({children:'Existing app'});};
  render().props.value({title:'First project',url:'https://portalink.test/first'});
  const first=nodes(render()).find(node=>node.type===api.InternalContentShareDialog);first.props.onClose();
  assert.equal(nodes(render()).some(node=>node.type===api.InternalContentShareDialog),false);
  render().props.value({title:'Second project',url:'https://portalink.test/second'});
  const next=nodes(render()).find(node=>node.type===api.InternalContentShareDialog);
  if(presentation==='mobile'){assert.notEqual(first.key,next.key);assert.equal(first.props.mobileSendLock,next.props.mobileSendLock);assert.equal(next.props.mobileSendLock.current,false);}
  else{assert.equal(first.key,next.key);assert.equal(first.props.mobileSendLock,next.props.mobileSendLock);assert.equal(next.props.mobileSendLock.current,false);}
 }
});

test('provider presentation and account changes close the active share without discarding a pending MOBILE send lock',()=>{
 for(const initial of ['mobile','web']){
  const slots=[],auth={viewerProfileId:'viewer',isAuthenticated:true};let cursor=0,effects=[],dirty=true,presentation=initial,tree;
  const react={...React,useRef:value=>slots[cursor++]??={current:value},useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]={value:initial};return[slots[index].value,value=>{if(!Object.is(slots[index].value,value)){slots[index].value=value;dirty=true;}}];},useEffect(callback,deps){const index=cursor++,previous=slots[index];if(!previous||deps.some((value,item)=>!Object.is(value,previous.deps[item]))){slots[index]={deps};effects.push(()=>{previous?.cleanup?.();slots[index].cleanup=callback();});}}};
  const api=compile('../src/features/sharing/InternalContentShare.tsx',{react,'../../contexts/AuthContext':{useAuth:()=>auth},'../../presentation/usePresentation':{usePresentation:()=>presentation}});
  const render=()=>{dirty=true;for(let pass=0;dirty;pass++){assert.ok(pass<8);cursor=0;dirty=false;effects=[];tree=api.InternalContentShareProvider({children:'Existing app'});effects.splice(0).forEach(callback=>callback());}return tree;};
  const dialog=()=>nodes(render()).find(node=>node.type===api.InternalContentShareDialog);
  render().props.value({title:'First project',url:'https://portalink.test/first'});const first=dialog(),lock=first.props.mobileSendLock;if(lock)lock.current=true;
  presentation=initial==='mobile'?'web':'mobile';render();assert.equal(dialog(),undefined,'Crossing the presentation boundary must dismiss the old recipient session.');
  presentation='mobile';render();render().props.value({title:'Next project',url:'https://portalink.test/next'});const next=dialog();
  if(lock){assert.equal(next.props.mobileSendLock,lock);assert.equal(lock.current,true,'The request still owns its lock after its modal was dismissed.');}
  auth.viewerProfileId='new-viewer';render();assert.equal(dialog(),undefined,'Changing account must dismiss the old recipient session.');
  render().props.value({title:'New account project',url:'https://portalink.test/new-account'});assert.equal(dialog().props.mobileSendLock,next.props.mobileSendLock);
 }
});


test('recipient scroll ownership is enabled only for the non-inline MOBILE Send screen',()=>{
 for(const options of [{presentation:'mobile',inline:false,expected:true},{presentation:'web',expected:false},{presentation:'mobile',inline:true,expected:false},{presentation:'web',inline:true,expected:false}]){
  const h=harness(undefined,undefined,options);h.render();assert.equal(h.scrollBoundaryCalls.at(-1),options.expected);
 }
});
