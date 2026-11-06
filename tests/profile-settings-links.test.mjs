import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { motionFixture } from './helpers/motion-fixture.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => typeof node === 'string' ? node : React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : '';
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label));

function hooks() {
  const instances = new Map();
  let slots, cursor;
  const react = { ...React,
    useState(initial) { const index = cursor++, ownSlots = slots; if (!(index in ownSlots)) ownSlots[index] = typeof initial === 'function' ? initial() : initial; return [ownSlots[index], value => { ownSlots[index] = typeof value === 'function' ? value(ownSlots[index]) : value; }]; },
    useId() { const index = cursor++; return slots[index] ??= `qa-${instances.size}-${index}`; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {},
  };
  return { react, render(key, fn) { slots = instances.get(key) ?? []; instances.set(key, slots); cursor = 0; return fn(); } };
}
function load(path, imports) {
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, { exports, require: name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  return exports;
}

function listHarness({ disabled = false, links: suppliedLinks } = {}) {
  const state = hooks();
  let links = suppliedLinks ?? ['One', 'Two', 'Three'].map((label, index) => ({ id: String(index), label, href: `https://example.test/${index}`, iconName: 'globe' }));
  const calls = [];
  const { ProfileLinksEditor } = load('src/features/profile/ProfileLinksEditor.tsx', {
    react: state.react,
    'framer-motion': { Reorder: { Group: 'reorder-group', Item: 'reorder-item' }, useDragControls: () => ({ start() {} }), useReducedMotion: () => false },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    '../../components/profile/categoryIcons': { getCategoryIcon: () => 'link-icon' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../presentation/motion/motion': motionFixture,
    './profileLinks': { isProfileLinkAction: action => ['bio', 'message', 'collaboration'].includes(action), MAX_PROFILE_LINKS: 20 },
    './profileLinksEditor.css': {},
  });
  const props = { errors: {}, disabled, onAdd: () => calls.push(['add']), onEdit: id => calls.push(['edit', id]),
    onRemove: id => { calls.push(['remove', id]); links = links.filter(link => link.id !== id); },
    onReorder: ids => { calls.push(['reorder', [...ids]]); links = [...ids.map(id => links.find(link => link.id === id)), ...links.filter(link => !ids.includes(link.id))]; },
  };
  const render = () => state.render('list', () => ProfileLinksEditor({ ...props, links }));
  const row = id => { const element = nodes(render()).find(node => typeof node.type === 'function' && node.props.link?.id === id); return state.render(`row-${id}`, () => element.type(element.props)); };
  return { render, row, calls, props, get links() { return links; } };
}

test('ordinary link rows contain no fields or destructive/reorder controls, and open the parent child page', () => {
  const h = listHarness();
  assert.equal(nodes(h.row('0')).some(node => node.type === 'input'), false);
  assert.equal(button(h.row('0'), 'Remove One'), undefined);
  assert.equal(button(h.row('0'), 'Reorder One'), undefined);
  button(h.row('0'), 'Edit One').props.onClick();
  button(h.render(), 'Add link').props.onClick();
  assert.deepEqual(h.calls, [['edit', '0'], ['add']]);
  assert.ok(text(h.render()).includes('Links appear on your public profile.'));
});

test('Edit reveals remove and a keyboard reorder handle; Done hides them without reversing draft order', () => {
  const h = listHarness();
  button(h.render(), 'Edit').props.onClick();
  const handle = button(h.row('1'), 'Reorder Two');
  assert.ok(handle);
  assert.ok(button(h.row('1'), 'Remove Two'));
  let prevented = false;
  handle.props.onKeyDown({ key: 'ArrowUp', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(h.links.map(link => link.id), ['1', '0', '2']);
  assert.ok(text(h.render()).includes('Two moved to position 1 of 3.'));
  button(h.render(), 'Done').props.onClick();
  assert.equal(button(h.row('1'), 'Reorder Two'), undefined);
  assert.deepEqual(h.links.map(link => link.id), ['1', '0', '2']);
});

test('Home and End reorder once, clamp endpoints, and preserve fixed action rows outside the editable list', () => {
  const h = listHarness({ links: [{ id: 'fixed', action: 'bio', label: 'Bio', href: '' }, { id: 'one', label: 'One', href: 'https://one.test' }, { id: 'two', label: 'Two', href: 'https://two.test' }] });
  button(h.render(), 'Edit').props.onClick();
  button(h.row('one'), 'Reorder One').props.onKeyDown({ key: 'End', preventDefault() {} });
  assert.deepEqual(h.calls[0], ['reorder', ['two', 'one']]);
  button(h.row('one'), 'Reorder One').props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(h.calls.length, 1);
  button(h.row('one'), 'Reorder One').props.onKeyDown({ key: 'Home', preventDefault() {} });
  assert.deepEqual(h.calls[1], ['reorder', ['one', 'two']]);
  assert.ok(h.links.some(link => link.id === 'fixed'));
  assert.equal(nodes(h.render()).some(node => node.props.link?.id === 'fixed'), false);
});

test('removal is edit-only, stays in the parent draft, and is announced', () => {
  const h = listHarness();
  button(h.render(), 'Edit').props.onClick();
  button(h.row('0'), 'Remove One').props.onClick({ currentTarget: { ownerDocument: { activeElement: null }, closest: () => null } });
  assert.deepEqual(h.calls, [['remove', '0']]);
  assert.ok(text(h.render()).includes('One removed.'));
  assert.equal(h.links.some(link => link.id === '0'), false);
});

function removalDOM(h, id) {
  const frames = [], focused = [], body = {}, outside = {};
  const document = { body, activeElement: null, modal: false, querySelector() { return this.modal ? {} : null; }, defaultView: { requestAnimationFrame: action => frames.push(action) } };
  const target = name => ({ name, disabled: false, isConnected: true, ownerDocument: document, getClientRects: () => [{}], closest: () => null, focus(options) { focused.push([name, options.preventScroll]); document.activeElement = this; } });
  const buttons = h.links.map(link => target(link.id)), add = target('add');
  const rows = buttons.map(control => ({ isConnected: true, parentElement: { querySelector: () => add }, contains: element => element === control, matches: () => true, querySelector: () => control }));
  for (let index = 0; index < rows.length; index++) { rows[index].previousElementSibling = rows[index - 1] ?? null; rows[index].nextElementSibling = rows[index + 1] ?? { matches: () => false }; buttons[index].closest = selector => selector === '.profile-links-item' ? rows[index] : null; }
  const index = h.links.findIndex(link => link.id === id), control = buttons[index], row = rows[index];
  document.activeElement = control;
  return { frames, focused, document, body, outside, control, row, buttons, add,
    detach() { row.isConnected = false; control.isConnected = false; if (document.activeElement === control) document.activeElement = body; },
    flush() { frames.splice(0).forEach(action => action()); },
  };
}

test('removing a focused row restores focus after rendering to next, previous or Add without scrolling', () => {
  for (const [id, count, expected] of [['0', 3, '1'], ['2', 3, '1'], ['0', 1, 'add']]) {
    const h = listHarness({ links: Array.from({ length: count }, (_, index) => ({ id: String(index), label: `Link ${index}`, href: 'https://example.test' })) });
    button(h.render(), 'Edit').props.onClick();
    const dom = removalDOM(h, id);
    button(h.row(id), `Remove Link ${id}`).props.onClick({ currentTarget: dom.control });
    assert.deepEqual(dom.focused, [], 'The old row must finish unmounting first.');
    dom.detach(); dom.flush();
    assert.deepEqual(dom.focused, [[expected, true]]);
  }
});

test('removal never takes focus from another control, a new dialog, or an unmounted destination', () => {
  for (const scenario of ['outside-before', 'outside-after', 'dialog-after', 'unmounted-after', 'not-removed']) {
    const h = listHarness(); button(h.render(), 'Edit').props.onClick();
    const dom = removalDOM(h, '0');
    if (scenario === 'outside-before') dom.document.activeElement = dom.outside;
    button(h.row('0'), 'Remove One').props.onClick({ currentTarget: dom.control });
    if (scenario !== 'not-removed') dom.detach();
    if (scenario === 'outside-after') dom.document.activeElement = dom.outside;
    if (scenario === 'dialog-after') dom.document.modal = true;
    if (scenario === 'unmounted-after') dom.buttons[1].isConnected = false;
    dom.flush();
    assert.deepEqual(dom.focused, [], scenario);
  }
});

test('disabled/ordinary lists reject drag reorder, and twenty links disable Add', () => {
  const h = listHarness();
  nodes(h.render()).find(node => node.type === 'reorder-group').props.onReorder(['2', '1', '0']);
  assert.equal(h.calls.length, 0);
  button(h.render(), 'Edit').props.onClick();
  h.props.disabled = true;
  nodes(h.render()).find(node => node.type === 'reorder-group').props.onReorder(['2', '1', '0']);
  button(h.row('0'), 'Reorder One').props.onKeyDown({ key: 'End', preventDefault() {} });
  assert.equal(h.calls.length, 0);
  const full = listHarness({ links: Array.from({ length: 20 }, (_, index) => ({ id: String(index), label: `Link ${index}`, href: 'https://example.test' })) });
  assert.equal(button(full.render(), 'Add link').props.disabled, true);
});

function pickerHarness(value = 'globe') {
  const state = hooks(), calls = [];
  const { ProfileLinkIconPicker } = load('src/features/profile/ProfileLinkIconPicker.tsx', {
    react: state.react, 'lucide-react': { SearchIcon: 'search-icon' },
    '../../components/profile/categoryIcons': { getCategoryIcon: () => 'icon', getPortalIconLabel: value => value, profileLinkIconNames: ['globe', 'instagram', 'lucide:accessibility'], profileLinkIconOptions: [{ name: 'globe', label: 'Globe' }, { name: 'instagram', label: 'Instagram' }] },
    '../../components/profile/PortalIconLibrary': { PortalIconLibrary: 'icon-library' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    './profileLinks': { DEFAULT_PROFILE_LINK_ICON: 'globe' }, './profileLinkIconPicker.css': {},
  });
  return { calls, render: () => state.render('picker', () => ProfileLinkIconPicker({ value, onDone: name => calls.push(['done', name]), onCancel: () => calls.push(['cancel']) })) };
}

test('icon choice and search are local; Cancel never submits the scratch selection', () => {
  const h = pickerHarness();
  nodes(h.render()).find(node => node.type === 'icon-library').props.onSelect('instagram');
  assert.deepEqual(h.calls, []);
  const input = nodes(h.render()).find(node => node.type === 'input');
  input.props.onChange({ target: { value: 'camera' } });
  assert.equal(nodes(h.render()).find(node => node.type === 'icon-library').props.searchQuery, 'camera');
  button(h.render(), 'Cancel').props.onClick();
  assert.deepEqual(h.calls, [['cancel']]);
});

test('Done submits the selected existing icon once; unknown saved names fall back safely', () => {
  const h = pickerHarness('lucide:accessibility');
  button(h.render(), 'Done').props.onClick();
  assert.deepEqual(h.calls, [['done', 'lucide:accessibility']]);
  const unknown = pickerHarness('not-an-icon');
  button(unknown.render(), 'Done').props.onClick();
  assert.deepEqual(unknown.calls, [['done', 'globe']]);
});

test('keyboard focus reveals only radio choices in the icon dialog and never submits a selection', () => {
  const h = pickerHarness(), calls = [];
  const scroller = nodes(h.render()).find(node => node.props['data-portal-icon-scroll'] !== undefined);
  scroller.props.onFocus({ target: { matches: selector => selector === 'button[role="radio"]', scrollIntoView: options => calls.push(JSON.parse(JSON.stringify(options))) } });
  assert.deepEqual(calls, [{ block: 'nearest', inline: 'nearest', behavior: 'instant' }]);
  scroller.props.onFocus({ target: { matches: () => false, scrollIntoView: () => assert.fail('Other controls must not scroll the icon library') } });
  assert.deepEqual(h.calls, []);
});
