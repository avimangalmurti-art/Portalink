import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

/** Render the real components with controlled state and invoke their actual event handlers. */
function avatarHarness(props) {
  const instances = new Map();
  let current;
  const react = {
    ...React,
    useState(initial) {
      const index = current.cursor++;
      const slots = current.slots;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useEffect() {},
    useRef(value) { return { current: value }; },
    useId() { return 'avatar-preview'; },
  };
  const image = { ResponsiveImage: ({ decorative, priority, ...attributes }) => React.createElement('img', attributes) };
  function load(path, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, require: (id) => id === 'react' ? react : imports[id] });
    return exports;
  }
  const creator = load('../src/components/profile/CreatorAvatar.tsx', { '../ui/ResponsiveImage': image });
  const { ProfileAvatar } = load('../src/components/profile/ProfileAvatar.tsx', {
    './CreatorAvatar': creator,
    '../ui/ResponsiveImage': image,
    '../ui/ModalPortal': { ModalPortal: ({ children }) => children },
  });
  function expand(node, path = 'root') {
    if (!React.isValidElement(node)) return node;
    if (typeof node.type === 'function') {
      if (!instances.has(path)) instances.set(path, []);
      current = { slots: instances.get(path), cursor: 0 };
      return expand(node.type(node.props), `${path}.render`);
    }
    return { type: node.type, props: node.props, children: React.Children.toArray(node.props.children).map((child, index) => expand(child, `${path}.${index}`)) };
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of node.children ?? []) { const match = find(child, predicate); if (match) return match; }
    return null;
  }
  return {
    render: () => expand(React.createElement(ProfileAvatar, props)),
    find,
  };
}

test('initials avatars open and dismiss the standard preview even without an uploaded image', () => {
  for (const avatar of [undefined, null, '']) {
    const harness = avatarHarness({ name: 'ManjulaM', avatar });
    const button = harness.find(harness.render(), (node) => node.type === 'button');
    assert.ok(button, 'An initials avatar must remain clickable');
    button.props.onClick();
    let tree = harness.render();
    const dialog = harness.find(tree, (node) => node.props?.role === 'dialog');
    assert.ok(dialog);
    assert.equal(harness.find(tree, (node) => node.type === 'figcaption').props.children, 'ManjulaM');
    assert.ok(harness.find(dialog, (node) => node.type === 'span' && node.props.children === 'M'));
    dialog.props.onClick();
    tree = harness.render();
    assert.equal(harness.find(tree, (node) => node.props?.role === 'dialog'), null);
  }
});

test('uploaded avatars open at full size and failed images fall back to initials inside the popup', () => {
  const harness = avatarHarness({ name: 'Portalink Networks', avatar: 'https://example.test/avatar.png' });
  harness.find(harness.render(), (node) => node.type === 'button').props.onClick();
  let dialog = harness.find(harness.render(), (node) => node.props?.role === 'dialog');
  const image = harness.find(dialog, (node) => node.type === 'img');
  assert.equal(image.props.src, 'https://example.test/avatar.png');
  assert.equal(image.props.width, 840);
  image.props.onError();
  dialog = harness.find(harness.render(), (node) => node.props?.role === 'dialog');
  assert.ok(dialog);
  assert.equal(harness.find(dialog, (node) => node.type === 'img'), null);
  assert.ok(harness.find(dialog, (node) => node.type === 'span' && node.props.children === 'PN'));
});
