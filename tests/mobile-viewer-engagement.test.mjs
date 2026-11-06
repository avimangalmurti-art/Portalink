import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import * as icons from 'lucide-react';

function compile(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}
const kinds = compile('../src/types/engagement.ts', () => ({}));
const InterfaceIcon = () => null;
const { EngagementBar } = compile('../src/features/engagement/EngagementBar.tsx', name => {
  if (name === 'react') return React;
  if (name === './capabilities') return { likesCapability:false };
  if (name === 'lucide-react') return icons;
  if (name.endsWith('/engagement')) return kinds;
  if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon };
  throw new Error(name);
});
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
function render(variant, selected = false, pending = false, leadingAction) {
  const actions = [];
  const tree = EngagementBar({ variant, leadingAction, projectTitle: 'Work', engagement: {
    isEngaged: () => selected, isPending: () => pending, count: () => null,
    isResolving: false, resolveError: null, toggle: kind => actions.push(kind),
  }, onShare: () => actions.push('share') });
  return { actions, tree, buttons: nodes(tree).filter(node => node.type === 'button') };
}

test('mobile viewer omits Like and Repost and retains neutral Save with its existing callback', () => {
  const h = render('viewer');
  assert.deepEqual(h.buttons.map(button => button.props['aria-label']), ['Save: Work']);
  const glyphs = h.buttons.map(button => nodes(button).find(node => node.type === InterfaceIcon));
  assert.ok(glyphs.every(icon => icon.props.stroke === 'currentColor'));
  assert.equal(glyphs[0].props.icon, icons.BookmarkIcon);
  h.buttons.forEach(button => button.props.onClick());
  assert.deepEqual(h.actions, ['save']);
});

test('selected and pending mobile actions retain monochrome feedback and protection', () => {
  const h = render('viewer', true, true);
  assert.equal(h.buttons[0].props['aria-pressed'], true);
  assert.equal(h.buttons[0].props.disabled, true);
  assert.equal(nodes(h.buttons[0]).find(node => node.type === InterfaceIcon).props.fill, 'currentColor');
});

test('desktop rail uses the system monochrome bookmark without Repost or Share', () => {
  const h = render('rail');
  assert.deepEqual(h.buttons.map(button => button.props['aria-label']), ['Save: Work']);
  assert.equal(nodes(h.buttons[0]).find(node => node.type === InterfaceIcon).props.stroke, 'currentColor');
  assert.equal(h.buttons.some(button => button.props['aria-label'] === 'Share: Work'), false);
});


test('shared guest engagement buttons all gate before mutations or sharing even while resolving', () => {
  const calls=[];
  const tree=EngagementBar({variant:'viewer',projectTitle:'Work',engagement:{isEngaged:()=>false,isPending:()=>false,count:()=>null,isResolving:true,resolveError:null,toggle:()=>assert.fail('guest mutation')},onShare:()=>assert.fail('guest share'),onRequireAccount:()=>calls.push('createAccount')});
  const buttons=nodes(tree).filter(n=>n.type==='button');
  assert.equal(buttons.length,1);
  for(const button of buttons){assert.ok(!button.props.disabled);button.props.onClick();}
  assert.deepEqual(calls,['createAccount']);
});

test('all project engagement presentations inherit system colours and retain accessible state',()=>{
 for(const variant of ['inline','panel','rail','viewer']) {
  const h=render(variant,true,false);
  assert.equal(h.buttons.length,1);
  for(const button of h.buttons) {
   assert.equal(button.props.style?.color,undefined);
   const glyph=nodes(button).find(n=>n.type===InterfaceIcon);
   assert.equal(glyph.props.stroke,'currentColor');
  }
  assert.equal(h.buttons[0].props['aria-pressed'],true);
  if(variant==='panel') assert.equal(nodes(h.tree).find(node=>node.props.role==='group').props.style.gridTemplateColumns,'repeat(1, minmax(0, 1fr))');
 }
 const leading=render('panel',false,false,React.createElement('button',{'aria-label':'Comments'}));
 assert.equal(nodes(leading.tree).find(node=>node.props.role==='group').props.style.gridTemplateColumns,'repeat(2, minmax(0, 1fr))','Comments and Bookmark share the panel width without an empty action column.');
});
