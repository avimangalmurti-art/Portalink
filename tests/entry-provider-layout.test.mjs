import React from 'react';import assert from 'node:assert/strict';import test from 'node:test';import {sourceModule} from './helpers/source-module.mjs';
function render(providers,presentation='mobile',handlers={}){let index=0;const api=sourceModule('src/components/auth/EntryChoices.tsx',{react:{...React,useEffect:()=>{},useRef:()=>({current:false}),useState:initial=>[index++===0?providers:typeof initial==='function'?initial():initial,()=>{}]},'../../contexts/ServicesContext':{useServices:()=>({auth:{}})},'../../contexts/AuthContext':{useAuth:()=>({})},'../../features/auth/registration':{readSharedReturnPath:x=>x},'../../presentation/usePresentation':{usePresentation:()=>presentation},'./oneScreenEntry.css':{},'./EntryAgreements':{EntryAgreements:'agreements',EntryLegal:'legal'}},{window:{location:{search:'',hash:''}}});const tree=api.EntryChoices({onSignIn(){},...handlers});return tree.props.children({request:async()=>false});}
const nodes=tree=>!React.isValidElement(tree)?[]:[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)];
const words=tree=>React.isValidElement(tree)?React.Children.toArray(tree.props.children).map(words).join(''):tree==null?'':String(tree);
test('ordinary account entry omits providers and availability messages by default on both presentations',()=>{
 for(const presentation of ['mobile','web'])for(const providers of [{google:false,apple:false},{google:true,apple:true}]){
  const all=nodes(render(providers,presentation));
  assert.equal(all.some(node=>node.props.className==='entry-providers'),false);
  assert.equal(all.some(node=>node.props.className==='entry-availability'),false);
  assert.equal(all.some(node=>'onGuest' in node.props||/guest/i.test(words(node))),false);
 }
});

test('explicit provider opt-in retains the described unavailable Google and Apple choices',()=>{const tree=render({google:false,apple:false},'mobile',{hideProviders:false});const row=nodes(tree).find(n=>n.props.className==='entry-providers');assert.equal(React.Children.count(row.props.children),2);const buttons=nodes(row).filter(n=>n.type==='button');assert.equal(buttons.length,2);for(const button of buttons){assert.equal(button.props.disabled,true);assert.ok(nodes(row).some(n=>n.type==='p'&&n.props.id===button.props['aria-describedby']));}});
test('explicit provider opt-in retains Google availability and keeps Apple disabled',()=>{const row=nodes(render({google:true,apple:true},'mobile',{hideProviders:false})).find(n=>n.props.className==='entry-providers');const buttons=nodes(row).filter(n=>n.type==='button');assert.equal(buttons[0].props.disabled,false);assert.equal(buttons[1].props.disabled,true);});

test('the cleaner default retains email, child content, legal entry and only the sign-in link',()=>{
 let email=0,signIn=0;
 for(const presentation of ['mobile','web']){
  const content=React.createElement('section',{'aria-label':'Account details'},'Create your account');
  const tree=render({google:false,apple:false},presentation,{children:content,onEmail:()=>email++,onSignIn:()=>signIn++});
  const all=nodes(tree),emailButton=all.find(n=>n.props.className==='entry-email');
  assert.equal(all.some(n=>n.props.className==='entry-providers'),false);
  assert.equal(all.find(n=>n.type==='section'&&n.props['aria-label']==='Account details')?.props.children,'Create your account');
  assert.ok(all.some(n=>n.type==='legal'));assert.equal(emailButton.props.disabled,false);
  emailButton.props.onClick();const links=all.find(n=>n.props.className==='entry-links');
  const buttons=nodes(links).filter(n=>n.type==='button');assert.equal(buttons.length,1);assert.equal(words(buttons[0]),'Already have an account? Sign in');buttons[0].props.onClick();
  assert.equal(/guest/i.test(words(tree)),false);
 }
 assert.equal(email,2);assert.equal(signIn,2);
});

test('the bootstrap presentation override works before an app context exists and preserves the entry callbacks',()=>{
 for(const [contextual,presentation] of [['web','mobile'],['mobile','web']]){
  const calls=[],onEmail=()=>calls.push('email'),onSignIn=()=>calls.push('signIn');
  const tree=render({google:false,apple:false},contextual,{presentation,hideProviders:false,onEmail,onSignIn}),all=nodes(tree);
  const email=all.find(node=>node.props.className==='entry-email'),providers=all.find(node=>node.props.className==='entry-providers');
  assert.equal(all.indexOf(email)<all.indexOf(providers),presentation==='mobile');
  assert.equal(email.props.onClick,onEmail);email.props.onClick();
  const links=nodes(all.find(node=>node.props.className==='entry-links')).filter(node=>node.type==='button');
  assert.equal(links.length,1);assert.equal(links[0].props.onClick,onSignIn);links[0].props.onClick();
  assert.deepEqual(calls,['email','signIn']);
  assert.equal(/guest/i.test(words(tree)),false);
  assert.ok(nodes(providers).filter(node=>node.type==='button').every(node=>node.props.disabled));
 }
});

test('verification can omit provider choices and their availability messages while retaining the form, links and legal entry',()=>{
 for(const presentation of ['mobile','web']){
 const calls=[],content=React.createElement('section',{'aria-label':'Email confirmation'},'Check your email');
 const all=nodes(render({google:true,apple:false},presentation,{hideProviders:true,children:content,onSignIn:()=>calls.push('signIn')}));
 assert.equal(all.some(node=>node.props.className==='entry-providers'),false);
 assert.equal(all.some(node=>node.props.className==='entry-availability'),false);
 assert.equal(all.find(node=>node.type==='section'&&node.props['aria-label']==='Email confirmation')?.props.children,'Check your email');
 const links=nodes(all.find(node=>node.props.className==='entry-links')).filter(node=>node.type==='button');
 assert.equal(links.length,1);assert.ok(links.every(node=>!node.props.disabled));links.forEach(node=>node.props.onClick());
 assert.deepEqual(calls,['signIn']);assert.ok(all.some(node=>node.type==='legal'));
 assert.equal(all.some(node=>'onGuest' in node.props||/guest/i.test(words(node))),false);
 }
 for(const presentation of ['mobile','web'])assert.equal(nodes(render({google:false,apple:false},presentation)).some(node=>node.props.className==='entry-providers'),false,'Ordinary account entry omits providers by default');
});

test('both presentations remove guest choices even when providers are enabled and account readiness changes',()=>{
 for(const presentation of ['mobile','web'])for(const ready of [true,false]){
  const guest=()=>assert.fail('Removed guest callback must not be attached to a control');
  const content=React.createElement('section',{'aria-label':'Account form'},'Your details');
  const tree=render({google:true,apple:true},presentation,{ready,hideProviders:false,onEmail(){},onGuest:guest,children:content});
  const all=nodes(tree),buttons=all.filter(node=>node.type==='button');
  assert.deepEqual(buttons.map(words),presentation==='mobile'?['Continue with email','Continue with Google','Continue with Apple','Already have an account? Sign in']:['Continue with Google','Continue with Apple','Continue with email','Already have an account? Sign in']);
  assert.ok(buttons.every(node=>node.props.onClick!==guest));
  assert.equal(all.some(node=>'onGuest' in node.props||/guest/i.test(words(node))),false);
  assert.ok(all.some(node=>node.type==='legal'));
  assert.equal(all.find(node=>node.props['aria-label']==='Account form').props.children,'Your details');
  assert.equal(buttons.find(node=>words(node)==='Continue with email').props.disabled,!ready);
  assert.equal(buttons.find(node=>words(node)==='Continue with Google').props.disabled,!ready);
  assert.equal(buttons.find(node=>words(node)==='Continue with Apple').props.disabled,true);
  assert.equal(buttons.find(node=>words(node)==='Already have an account? Sign in').props.disabled,!ready);
 }
});
