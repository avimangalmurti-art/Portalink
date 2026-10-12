import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/legal/model.ts'),markdown=sourceModule('src/features/legal/markdown.ts');
const documents=model.LEGAL_KEYS.map(key=>({key,version:'1.0',title:key,markdown_body:'Draft text',effective_at:'2026-10-12T00:00:00Z'}));
function harness(onEmail){
  const slots=[];let cursor=0;
  const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=next;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(){}};
  const {TermsSheet}=sourceModule('src/features/legal/TermsSheet.tsx',{react,'react-dom':{createPortal:element=>element},'./model':model,'./markdown':markdown,'./terms.css':{}},{Error,document:{body:{}}});
  const props={documents,onEmail,onAgree(){},onDisagree(){},onRetry(){}};
  return{props,render(){cursor=0;return TermsSheet(props);}};
}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];}
function text(tree){if(typeof tree==='string')return tree;if(!tree||typeof tree!=='object')return '';return React.Children.toArray(tree.props?.children).map(text).join('');}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('email double tap invokes the mail path once and displays its confirmation or unavailable state',async()=>{
  let calls=0,resolve;const h=harness(()=>{calls++;return new Promise(done=>{resolve=done;});});
  const button=nodes(h.render()).find(node=>node.type==='button'&&text(node)==='Send by Email');button.props.onClick();button.props.onClick();assert.equal(calls,1);
  resolve('The four agreements were sent to your account email.');await tick();assert.ok(nodes(h.render()).some(node=>node.props?.role==='status'&&text(node).includes('were sent')));
  const unavailable=harness(async()=>{throw new Error('Email not available yet');});nodes(unavailable.render()).find(node=>node.type==='button'&&text(node)==='Send by Email').props.onClick();await tick();
  const disabled=nodes(unavailable.render()).find(node=>node.type==='button'&&text(node)==='Email not available yet');assert.equal(disabled.props.disabled,true);
});
test('Agreement C opens in place with levels before its legal text; read-only review has accepted versions/dates and no acceptance buttons',()=>{
  const h=harness(async()=> 'Sent');nodes(h.render()).find(node=>node.type==='button'&&text(node).startsWith('C. Content Licence')).props.onClick();
  const tree=h.render();assert.ok(text(tree).includes('‹ Terms and Conditions'));assert.match(text(tree),/Effective 2026-10-12/);const all=nodes(tree);const levels=all.findIndex(node=>node.props?.className==='terms-card terms-levels'),body=all.findIndex(node=>node.props?.className==='terms-card terms-legal-text');assert.ok(levels>=0&&body>levels);assert.equal(all.some(node=>node.type==='svg'),false);
  const readOnly=harness(async()=> 'Sent');readOnly.props.readOnly=true;readOnly.props.accepted=documents.map(row=>({key:row.key,version:'1.0',accepted_at:'2026-10-12T01:00:00Z'}));const review=readOnly.render();assert.match(text(review),/Accepted v1.0/);assert.equal(nodes(review).filter(node=>node.type==='button'&&['Agree','Disagree'].includes(text(node))).length,0);assert.ok(text(review).includes('Done'));
});
