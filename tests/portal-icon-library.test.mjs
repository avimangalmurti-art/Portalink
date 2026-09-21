import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('../src/data/portal-icon-catalog.json', import.meta.url), 'utf8'));
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => name in imports ? imports[name] : require(name) });
  return exports;
}
const icons = load('../src/components/profile/categoryIcons.ts', { '../../data/portal-icon-catalog.json': catalog });

test('expanded catalog preserves legacy and profile-link IDs and rejects unknown icon paths', () => {
  assert.equal(icons.categoryIconNames.length, 58);
  assert.equal(icons.profileLinkIconOptions.length, 77);
  assert.ok(icons.portalIconNames.length > 1600);
  assert.equal(new Set(icons.portalIconNames).size, icons.portalIconNames.length);
  assert.equal(icons.getCategoryIcon('book'), require('lucide-react').BookOpenIcon);
  assert.equal(icons.getCategoryIcon('x'), require('react-icons/si').SiX);
  for (const name of ['unknown', '__proto__', 'lucide:../camera', 'lucide:<script>']) {
    assert.equal(icons.getCategoryIcon(name), require('lucide-react').ShapesIcon);
  }
  assert.equal(icons.getCategoryIcon('lucide:telescope'), icons.getCategoryIcon('lucide:telescope'), 'stable renderer identity');
  const markup = renderToStaticMarkup(React.createElement(icons.getCategoryIcon('lucide:telescope'), { className: 'preview', stroke: 'red' }));
  assert.match(markup, /class="preview"/);
  assert.match(markup, /stroke="red"/);
  assert.ok(markup.includes(`${catalog.sprite}#telescope`));
});

test('every library icon has a local symbol and searchable readable name', () => {
  const svg = readFileSync(new URL(`../public${catalog.sprite.split('?')[0]}`, import.meta.url), 'utf8');
  for (const name of catalog.names) assert.ok(svg.includes(`<symbol id="${name}"`), name);
  assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+=|\shref=/i);
  assert.equal(icons.getPortalIconLabel('lucide:alarm-clock'), 'Alarm Clock');
  assert.deepEqual([...icons.searchPortalIcons(' ALARM clock ')], [...icons.searchPortalIcons('alarm-clock')]);
  assert.ok(icons.searchPortalIcons('telescope').includes('lucide:telescope'));
  assert.equal(icons.searchPortalIcons('xyz-no-such-icon').length, 0);
});

function harness(selected = 'shapes') {
  const slots = []; let cursor = 0;
  const react = { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  } };
  const { PortalIconLibrary } = load('../src/components/profile/PortalIconLibrary.tsx', {
    react, './categoryIcons': icons, '../ui/InterfaceIcon': { InterfaceIcon: () => null },
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
  });
  const props = { selected, compact: true, onSelect: name => { props.selected = name; } };
  return { props, render() { cursor = 0; return PortalIconLibrary(props); } };
}
const all = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(all)] : [];
const radios = tree => all(tree).filter(node => node.props.role === 'radio');
const search = tree => all(tree).find(node => node.type === 'input');

test('picker bounds rendering, searches, exposes a tab stop and does not reorder during selection', () => {
  const h = harness(); let tree = h.render();
  assert.equal(radios(tree).length, 60);
  const before = radios(tree).map(node => node.key);
  radios(tree)[5].props.onClick(); tree = h.render();
  assert.deepEqual(radios(tree).map(node => node.key), before);
  all(tree).find(node => node.props.children === 'Show more icons').props.onClick();
  assert.equal(radios(h.render()).length, 120);
  search(tree).props.onChange({ target: { value: 'telescope' } }); tree = h.render();
  assert.equal(radios(tree).length, 1);
  assert.equal(radios(tree)[0].props.tabIndex, 0);
  assert.equal(radios(tree)[0].props['aria-checked'], false);
  radios(tree)[0].props.onClick();
  assert.equal(h.props.selected, 'lucide:telescope');
  h.props.disabled = true;
  assert.ok(radios(h.render()).every(node => node.props.disabled));
  assert.equal(search(h.render()).props.autoFocus, undefined);
});

test('reopening locates a saved extended icon; no-result search retains that selection', () => {
  const h = harness('lucide:telescope'); let tree = h.render();
  assert.equal(radios(tree)[0].props['aria-checked'], true);
  search(tree).props.onChange({ target: { value: 'xyz-no-such-icon' } });
  assert.equal(radios(h.render()).length, 0);
  assert.equal(h.props.selected, 'lucide:telescope');
  search(h.render()).props.onChange({ target: { value: '' } });
  assert.equal(radios(h.render()).length, 60);
  assert.equal(radios(h.render())[0].props['aria-checked'], true);
});

test('parent-owned search replaces the standalone field and bounds each new query', () => {
  const h = harness();
  h.props.searchQuery = '';
  let tree = h.render();
  assert.equal(search(tree), undefined);
  all(tree).find(node => node.props.children === 'Show more icons').props.onClick();
  assert.equal(radios(h.render()).length, 120);
  h.props.searchQuery = 'telescope';
  assert.equal(radios(h.render()).length, 1);
  h.props.searchQuery = 'arrow';
  assert.equal(radios(h.render()).length, 60);
});

function dialogHarness() {
  const slots = [], calls = []; let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() { cursor++; },
  };
  const Library = () => null;
  const { NewCategoryDialog } = load('../src/components/profile/NewCategoryDialog.tsx', {
    react, './categoryIcons': icons, './PortalIconLibrary': { PortalIconLibrary: Library },
    '../ui/InterfaceIcon': { InterfaceIcon: () => null }, '../ui/ModalPortal': { ModalPortal: ({ children }) => children },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    '../../hooks/useModalFocus': { useModalFocus() {} },
  });
  const props = { itemName: 'portal', onCancel: () => calls.push('cancel'), onCreate: (...args) => calls.push(args) };
  return { props, calls, render() { cursor = 0; return NewCategoryDialog(props); }, library: tree => all(tree).find(node => node.type === Library) };
}
const toggle = tree => all(tree).find(node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean');
const form = tree => all(tree).find(node => node.type === 'form');

test('New portal keeps its title through search and selection without creating prematurely', () => {
  const h = dialogHarness(); let tree = h.render();
  search(tree).props.onChange({ target: { value: '  Astronomy  ' } });
  tree = h.render(); toggle(tree).props.onClick(); tree = h.render();
  assert.equal(search(tree).props.type, 'search');
  assert.equal(search(tree).props.value, '');
  assert.equal(search(tree).props.maxLength, undefined);
  search(tree).props.onChange({ target: { value: 'telescope' } }); tree = h.render();
  assert.equal(h.library(tree).props.searchQuery, 'telescope');
  let prevented = false;
  search(tree).props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
  h.library(tree).props.onSelect('lucide:telescope'); tree = h.render();
  assert.equal(search(tree).props.type, 'text');
  assert.equal(search(tree).props.value, '  Astronomy  ');
  assert.equal(h.library(tree).props.searchQuery, '');
  assert.equal(h.library(tree).props.selected, 'lucide:telescope');
  assert.equal(h.calls.length, 0);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.calls, [['Astronomy', 'lucide:telescope']]);
});

test('search cancellation preserves the draft and saving locks both modes', () => {
  const h = dialogHarness(); let tree = h.render();
  search(tree).props.onChange({ target: { value: 'Design' } });
  toggle(h.render()).props.onClick(); tree = h.render();
  search(tree).props.onChange({ target: { value: 'camera' } });
  toggle(h.render()).props.onClick(); tree = h.render();
  assert.equal(search(tree).props.value, 'Design');
  assert.equal(h.library(tree).props.selected, 'shapes');
  assert.equal(h.calls.length, 0);
  h.props.isSaving = true; tree = h.render();
  assert.equal(search(tree).props.disabled, true);
  assert.equal(toggle(tree).props.disabled, true);
  assert.equal(h.library(tree).props.disabled, true);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
});
