import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/ControlCenterPage.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React, esModuleInterop:true} }).outputText;
function load(auth, nav, react = React) {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, DOMException, require(name) {
    if(name === 'react') return react;
    if(name.endsWith('/AuthContext')) return {useAuth:()=>auth};
    if(name.endsWith('/useAppRoute')) return {useRouteNavigator:()=>nav};
    if(name.endsWith('/routes')) return {buildPath:name=>`/${name}`};
    if(name.endsWith('.css')) return {};
    if(name.endsWith('/Button')) return {Button:'button'};
    if(name.endsWith('/NavigationButtonsPanel')) return {NavigationButtonsPanel:'appearance-panel'};
    if(name.endsWith('/DeleteAccountDialog')) return {DeleteAccountDialog:'delete-dialog'};
    if(name.endsWith('/InterfaceIcon')) return {InterfaceIcon:()=>null};
    return {};
  }});
  return exports.ControlCenterPage;
}
const action = (tree,label) => all(tree).find(n => typeof n.props.onClick === 'function' && all(n).some(child=>child.props.children===label));
const props = {theme:'dark',appearanceMode:'dark',systemGray:'gray',accentColor:'#ff375f',highContrast:false,reduceTranslucency:false,language:'auto',onBack(){},onOpenProfile(){}};
const all = node => React.isValidElement(node) ? [node,...React.Children.toArray(node.props.children).flatMap(all)] : [];
test('Settings is a page with visible Back, seven collapsed sections and no modal on first paint', () => {
  for(const isAuthenticated of [false,true]) {
    const Page=load({isAuthenticated,viewerProfileId:isAuthenticated?'owner':null},{});
    const html=renderToStaticMarkup(React.createElement(Page,props));
    assert.match(html,/<h1>Settings<\/h1>/);
    assert.match(html,/aria-label="Back"/);
    assert.equal((html.match(/aria-expanded="false"/g)||[]).length,7);
    for(const name of ['Appearance','Account','Invite a friend','Privacy','Notifications','Language','About']) assert.ok(html.includes(name));
    assert.doesNotMatch(html,/role="dialog"|aria-modal|settings-section-content|appearance-panel|delete-dialog/);
  }
});

test('guest private destinations request authentication before leaving Settings', () => {
  const calls=[];
  const react={...React,useState:value=>[value,()=>{}]};
  const Page=load({isAuthenticated:false,requestAuthenticatedDestination:intent=>calls.push(intent)},
    {to(){assert.fail('A shared visitor must not be redirected before sign-in');}},react);
  for(const title of ['Open messages','View notifications']) action(Page(props),title).props.onClick();
  assert.deepEqual(calls.map(c=>c.path),['/messages','/notifications']);
  assert.ok(calls.every(c=>c.kind==='route'));
});
test('section expansion mounts content and collapse removes its reserved space', () => {
  let state=false;
  const react={...React,useState:()=>[state,fn=>{state=fn(state);} ]};
  const Page=load({isAuthenticated:false},{},react);
  const section=all(Page(props)).find(n=>n.props.id==='account');
  let tree=section.type(section.props);
  assert.equal(all(tree).some(n=>n.props.className==='settings-section-content'),false);
  all(tree).find(n=>n.type==='button').props.onClick();
  tree=section.type(section.props);
  assert.equal(all(tree).some(n=>n.props.className==='settings-section-content'),true);
  all(tree).find(n=>n.type==='button').props.onClick();
  assert.equal(all(section.type(section.props)).some(n=>n.props.className==='settings-section-content'),false);
});
test('Account reuses sign-in/signup for guests and owner profile navigation for authenticated users', () => {
  const calls=[];
  const react={...React,useState:value=>[value,()=>{}]};
  let Page=load({isAuthenticated:false,requestAuth:view=>calls.push(view),requestAuthenticatedDestination:(intent,view)=>{assert.equal(intent.kind,'my-profile');calls.push(view);}},{},react);
  let account=all(Page(props)).find(n=>n.props.id==='account');
  action(account,'Sign in').props.onClick();
  action(account,'Create account').props.onClick();
  assert.deepEqual(calls,['signIn','signUp']);
  Page=load({isAuthenticated:true,viewerProfileId:'owner'},{profileEditor:()=>calls.push('edit')},react);
  account=all(Page({...props,onOpenProfile:()=>calls.push('profile')})).find(n=>n.props.id==='account');
  action(account,'View profile').props.onClick();
  action(account,'Edit profile').props.onClick();
  assert.deepEqual(calls.slice(-2),['profile','edit']);
});
