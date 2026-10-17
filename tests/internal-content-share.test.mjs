import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
const messageImports={react:React,'react-router-dom':{Link:'link'},'../../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworks.com'},'../../features/sharing/shareModel':compile('../src/features/sharing/shareModel.ts',{})};
function compile(file,mocks,extra='') {
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText+extra,{exports,require:n=>mocks[n]??{},URL});return exports;
}
function harness(conversation={id:'thread',status:'active'},send=async()=>({id:'message'})) {
 let cursor=0;const slots=[],calls=[];
 const react={...React,useRef:v=>slots[cursor++]??={current:v},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],next=>{slots[i]=next;}];}};
 const {dialog}=compile('../src/features/sharing/InternalContentShare.tsx',{react,
 '../../contexts/ServicesContext':{useServices:()=>({messaging:{getOrCreateConversation:async id=>{calls.push(['recipient',id]);return conversation;},sendMessage:async(...args)=>{calls.push(['send',...args]);return send();}}})},
 '../../components/messages/NewChatPanel':{NewChatPanel:'recipients'},'../../components/ui/ModalPortal':{ModalPortal:'portal'},
 '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},
 },'\nexports.dialog=InternalContentShareDialog;');
 const render=()=>{cursor=0;return dialog({target:{title:'Project',url:'https://portalink.test/p/creator/c/portal/work',onSent:()=>calls.push(['confirmed'])},onClose:()=>calls.push(['close'])});};
 const button=label=>nodes(render()).find(n=>n.type==='button'&&n.props.children===label);
 const select=()=>nodes(render()).find(n=>n.type==='recipients').props.onSelectCreator('recipient');
 return {render,button,select,calls};
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
