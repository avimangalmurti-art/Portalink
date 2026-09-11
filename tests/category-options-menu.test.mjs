import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function harness(mobile = true, capability = { isAvailable: true, removes: ['Empty portal'], blockingProjectCount: 0 }) {
  let cursor = 0, effects = []; const slots = [], calls = [];
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef() { const index = cursor++; return slots[index] ??= { current: null }; },
    useEffect(effect, deps) { const index = cursor++; if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) { slots[index]?.cleanup?.(); const item = slots[index] = { deps }; effects.push(() => { item.cleanup = effect(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/CategoryOptionsMenu.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, document: { body: {}, addEventListener() {}, removeEventListener() {} }, window: { innerHeight: 800 }, require(name) {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: child => child };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.endsWith('/accentTokens')) return { resolveAccentTokens: () => ({}) };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: () => null };
    throw new Error(name);
  } });
  const props = { category: { id: 'portal', label: 'Design' }, mobile, theme: 'dark', accentColor: '#ff2d55',
    readDeletionCapability: async () => { calls.push('check'); return capability; },
    onDelete: () => calls.push('delete'), onHideToggle: () => calls.push('hide'), onRenameStart: () => calls.push('rename'), onChangeIcon: () => calls.push('icon') };
  return { calls, props, render() { cursor = 0; effects = []; const tree = exports.CategoryOptionsMenu(props); effects.forEach(fn => fn()); return tree; } };
}
function all(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(all)] : []; }
const text = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');
const button = (tree, label) => all(tree).find(node => node.type === 'button' && text(node).trim() === label);
function open(h) { const tree = h.render(); all(tree).find(node => node.props['aria-haspopup'] === 'menu').props.onClick({ stopPropagation() {} }); return h.render(); }

test('mobile exposes touch-sized menu actions while WEB retains its compact trigger', () => {
  for (const mobile of [true, false]) {
    const h = harness(mobile); const closed = h.render();
    assert.match(all(closed).find(node => node.type === 'button').props.className, mobile ? /h-11 w-11/ : /h-6 w-6/);
    const tree = open(h);
    assert.deepEqual(all(tree).filter(node => node.props.role === 'menuitem').map(text), ['Hide', 'Rename', 'Change icon', 'Delete']);
    assert.equal(all(tree).find(node => node.props.role === 'menu').props.style.position, 'fixed');
  }
  for (const [label, call] of [['Hide', 'hide'], ['Rename', 'rename'], ['Change icon', 'icon']]) {
    const h = harness(); button(open(h), label).props.onClick();
    assert.deepEqual(h.calls, [call]);
    assert.equal(all(h.render()).some(node => node.props.role === 'menu'), false);
  }
});

test('Delete requires a fresh capability check and a separate confirmation; occupied portals cannot be deleted', async () => {
  for (const allowed of [true, false]) {
    const h = harness(true, { isAvailable: allowed, removes: [], reason: 'Move projects first.', blockingProjectCount: allowed ? 0 : 2 });
    button(open(h), 'Delete').props.onClick();
    assert.equal(button(h.render(), 'Delete').props.disabled, true);
    assert.deepEqual(h.calls, ['check']);
    await Promise.resolve(); await Promise.resolve();
    const confirmation = button(h.render(), 'Delete');
    if (allowed) { assert.equal(confirmation.props.disabled, false); confirmation.props.onClick(); assert.deepEqual(h.calls, ['check', 'delete']); }
    else { assert.equal(confirmation, undefined); assert.deepEqual(h.calls, ['check']); }
  }
});
