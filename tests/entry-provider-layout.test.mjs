import React from 'react';import assert from 'node:assert/strict';import test from 'node:test';import {sourceModule} from './helpers/source-module.mjs';
function render(providers,presentation='mobile',handlers={}){let index=0;const api=sourceModule('src/components/auth/EntryChoices.tsx',{react:{...React,useEffect:()=>{},useRef:()=>({current:false}),useState:initial=>[index++===0?providers:typeof initial==='function'?initial():initial,()=>{}]},'../../contexts/ServicesContext':{useServices:()=>({auth:{}})},'../../contexts/AuthContext':{useAuth:()=>({})},'../../features/auth/registration':{readSharedReturnPath:x=>x},'../../presentation/usePresentation':{usePresentation:()=>presentation},'./oneScreenEntry.css':{},'./EntryAgreements':{EntryAgreements:'agreements',EntryLegal:'legal'}},{window:{location:{search:'',hash:''}}});const tree=api.EntryChoices({onSignIn(){},onGuest(){},...handlers});return tree.props.children({request:async()=>false});}
const nodes=tree=>!React.isValidElement(tree)?[]:[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)];
test('Google and Apple share the provider row with described unavailable messages',()=>{const tree=render({google:false,apple:false});const row=nodes(tree).find(n=>n.props.className==='entry-providers');assert.equal(React.Children.count(row.props.children),2);const buttons=nodes(row).filter(n=>n.type==='button');assert.equal(buttons.length,2);for(const button of buttons){assert.equal(button.props.disabled,true);assert.ok(nodes(row).some(n=>n.type==='p'&&n.props.id===button.props['aria-describedby']));}});
test('Apple stays disabled even if an unrelated provider response reports it enabled',()=>{const row=nodes(render({google:true,apple:true})).find(n=>n.props.className==='entry-providers');const buttons=nodes(row).filter(n=>n.type==='button');assert.equal(buttons[0].props.disabled,false);assert.equal(buttons[1].props.disabled,true);});

test('mobile email precedes providers and compact links retain sign-in and guest actions; WEB order remains',()=>{
 let email=0,signIn=0,guest=0;
 for(const presentation of ['mobile','web']){
  const tree=render({google:false,apple:false},presentation,{onEmail:()=>email++,onSignIn:()=>signIn++,onGuest:()=>guest++});
  const all=nodes(tree),emailButton=all.find(n=>n.props.className==='entry-email'),providers=all.find(n=>n.props.className==='entry-providers');
  assert.equal(all.indexOf(emailButton)<all.indexOf(providers),presentation==='mobile');
  emailButton.props.onClick();const links=all.find(n=>n.props.className==='entry-links');
  const buttons=nodes(links).filter(n=>n.type==='button');assert.equal(buttons.length,2);buttons.forEach(n=>n.props.onClick());
 }
 assert.equal(email,2);assert.equal(signIn,2);assert.equal(guest,2);
});

test('the bootstrap presentation override works before an app context exists and preserves the entry callbacks',()=>{
 for(const [contextual,presentation] of [['web','mobile'],['mobile','web']]){
  const calls=[],onEmail=()=>calls.push('email'),onSignIn=()=>calls.push('signIn'),onGuest=()=>calls.push('guest');
  const tree=render({google:false,apple:false},contextual,{presentation,onEmail,onSignIn,onGuest}),all=nodes(tree);
  const email=all.find(node=>node.props.className==='entry-email'),providers=all.find(node=>node.props.className==='entry-providers');
  assert.equal(all.indexOf(email)<all.indexOf(providers),presentation==='mobile');
  assert.equal(email.props.onClick,onEmail);email.props.onClick();
  const links=nodes(all.find(node=>node.props.className==='entry-links')).filter(node=>node.type==='button');
  assert.equal(links[0].props.onClick,onSignIn);assert.equal(links[1].props.onClick,onGuest);links.forEach(node=>node.props.onClick());
  assert.deepEqual(calls,['email','signIn','guest']);
  assert.ok(nodes(providers).filter(node=>node.type==='button').every(node=>node.props.disabled));
 }
});
