import { motionFixture } from './helpers/motion-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => typeof node === 'string' ? node : React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : '';
const button = (tree, name) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || text(node) === name));

function harness({ mobile = true, reduce = false } = {}) {
  const instances = new Map(), opened = [], links = [{ id: 'old', label: 'Website', href: 'https://example.com', iconName: 'globe' }];
  let slots, cursor;
  const react = { ...React,
    useState(initial) {
      const index = cursor++, ownSlots = slots;
      if (!(index in ownSlots)) ownSlots[index] = typeof initial === 'function' ? initial() : initial;
      return [ownSlots[index], value => { ownSlots[index] = typeof value === 'function' ? value(ownSlots[index]) : value; }];
    },
    useId() { const index = cursor++; return slots[index] ??= `qa-${instances.size}-${index}`; },
  };
  const mocks = {
    react,
    '../../presentation/motion/motion': motionFixture,
    'framer-motion': { Reorder: { Group: 'group', Item: 'item' }, useDragControls: () => ({ start() {} }), useReducedMotion: () => reduce },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '../../components/profile/categoryIcons': { getCategoryIcon: () => 'icon' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    './profileLinks': { isProfileLinkAction: () => false, MAX_PROFILE_LINKS: 20 },
    './profileLinksEditor.css': {},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/profile/ProfileLinksEditor.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  function renderIn(key, component) {
    slots = instances.get(key) ?? []; instances.set(key, slots); cursor = 0;
    return component();
  }
  const render = () => renderIn('list', () => exports.ProfileLinksEditor({
    links, compact: mobile, errors: {}, disabled: false,
    onAdd: () => opened.push({ kind: 'new' }),
    onEdit: id => opened.push({ kind: 'edit', id }),
    onRemove() {}, onReorder() {},
  }));
  const row = () => { const element = nodes(render()).find(node => node.props.link?.id === 'old'); return renderIn('row', () => element.type(element.props)); };
  return { links, opened, render, row };
}

test('MOBILE and WEB Add open a child scratch editor without inserting unfinished links into the profile draft', () => {
  for (const mobile of [true, false]) {
    const h = harness({ mobile });
    button(h.render(), 'Add link').props.onClick();
    assert.deepEqual(h.opened, [{ kind: 'new' }]);
    assert.equal(h.links.length, 1);
    assert.equal(h.links[0].label, 'Website');
    assert.equal(nodes(h.render()).some(node => node.type === 'input'), false, 'The overview is a clean list; fields belong to its child editor.');
    button(h.row(), 'Edit Website').props.onClick();
    assert.deepEqual(h.opened.at(-1), { kind: 'edit', id: 'old' });
    assert.equal(h.links.length, 1);
  }
});

test('reduced motion disables row layout animation while preserving both platforms child-editor actions', () => {
  for (const mobile of [true, false]) {
    const reduced = harness({ mobile, reduce: true });
    assert.equal(reduced.row().props.transition.duration, 0);
    button(reduced.row(), 'Edit Website').props.onClick();
    assert.deepEqual(reduced.opened, [{ kind: 'edit', id: 'old' }]);
    const normal = harness({ mobile, reduce: false });
    assert.ok(normal.row().props.transition.duration > 0);
    assert.equal(button(normal.row(), 'Reorder Website'), undefined, 'Reorder affordances remain hidden outside Edit mode.');
  }
});

test('every portal icon is accepted for saved links, and a new icon survives link normalization',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../src/data/portal-icon-catalog.json',import.meta.url),'utf8'));
 const icons={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/categoryIcons.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:icons,require:id=>id==='react'?React:id.endsWith('portal-icon-catalog.json')?catalog:new Proxy({},{get:(_,key)=>key})});
 assert.ok(icons.portalIconNames.length>1000);
 for(const name of icons.portalIconNames)assert.ok(icons.profileLinkIconNames.includes(name),name);
 const helpers={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/profile/profileLinks.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:helpers,require:()=>icons});
 const link=helpers.normalizeProfileLink({label:'Access guide',href:'https://example.com',iconName:'lucide:accessibility'});
 assert.equal(link.iconName,'lucide:accessibility');
 assert.equal(helpers.normalizeProfileLink({...link,iconName:'not-a-real-icon'}).iconName,'globe');
});
