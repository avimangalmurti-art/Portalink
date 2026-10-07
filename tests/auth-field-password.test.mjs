import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function harness() {
  const fields = new Map();
  let slots, cursor;
  const react = { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    const fieldSlots = slots;
    return [fieldSlots[index], next => { fieldSlots[index] = typeof next === 'function' ? next(fieldSlots[index]) : next; }];
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/auth/AuthField.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'lucide-react') return Object.fromEntries(['AlertCircleIcon', 'EyeIcon', 'EyeOffIcon', 'MailIcon', 'LockKeyholeIcon'].map(name => [name, name]));
    throw new Error(`Unexpected auth field dependency: ${name}`);
  } });
  return (props, ref = null) => {
    if (!fields.has(props.id)) fields.set(props.id, []);
    slots = fields.get(props.id); cursor = 0;
    return exports.AuthField.render(props, ref);
  };
}
function nodes(tree) {
  return React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
}
const input = tree => nodes(tree).find(node => node.type === 'input');
const toggle = tree => nodes(tree).find(node => node.type === 'button');
const defaults = { id: 'password', label: 'Password', type: 'password', value: 'unchanged-password', autoComplete: 'new-password', onChange() {} };

test('signup password fields reveal independently without changing values, refs or password-manager tokens', () => {
  for (const compact of [false, true]) {
    const render = harness(), changes = [], ref = { current: null };
    const password = { ...defaults, compact, revealPassword: true, onChange: value => changes.push(value) };
    const confirmation = { ...password, id: 'confirmation', label: 'Confirm password' };
    let first = render(password, ref), second = render(confirmation);
    assert.equal(input(first).props.type, 'password');
    assert.equal(input(second).props.type, 'password');
    assert.equal(toggle(first).props['aria-label'], 'Show password');
    assert.equal(toggle(second).props['aria-label'], 'Show password');
    assert.equal(toggle(first).props['aria-controls'], password.id);
    assert.equal(toggle(second).props['aria-controls'], confirmation.id);
    assert.equal(toggle(second).props['aria-describedby'], nodes(second).find(node => node.type === 'label').props.id);
    assert.equal(toggle(first).props.type, 'button', 'Revealing must never submit the form');
    toggle(first).props.onClick();
    first = render(password, ref); second = render(confirmation);
    assert.equal(input(first).props.type, 'text');
    assert.equal(input(second).props.type, 'password');
    assert.equal(toggle(first).props['aria-label'], 'Hide password');
    assert.equal(input(first).props.value, password.value);
    assert.equal(input(first).props.autoComplete, 'new-password');
    assert.equal(input(first).ref, ref);
    assert.deepEqual(changes, [], 'Visibility is local UI state, not a value change');
    toggle(second).props.onClick();
    toggle(first).props.onClick();
    first = render(password, ref); second = render(confirmation);
    assert.equal(input(first).props.type, 'password');
    assert.equal(input(second).props.type, 'text');
    assert.equal(toggle(second).props['aria-label'], 'Hide password');
    input(second).props.onChange({ target: { value: 'edited-password' } });
    assert.deepEqual(changes, ['edited-password']);
    assert.equal(input(render({ ...confirmation, value: 'edited-password' })).props.type, 'text');
  }
});

test('opt-in controls reserve trailing input space and a 44px target in compact and regular fields', () => {
  for (const compact of [false, true]) {
    const render = harness();
    const tree = render({ ...defaults, compact, revealPassword: true });
    assert.equal(input(tree).props.style.paddingRight, 52, 'Inline padding survives the existing welcome input styles');
    assert.match(toggle(tree).props.className, /\bh-11\b/);
    assert.match(toggle(tree).props.className, /\bw-11\b/);
    assert.equal(toggle(tree).props.children.type, 'EyeIcon');
    assert.equal(toggle(tree).props.children.props['aria-hidden'], 'true');
    if (compact) {
      const wrapper = nodes(tree).find(node => node.props.className === 'mobile-onboarding-input');
      assert.deepEqual(React.Children.toArray(wrapper.props.children).map(node => node.type), ['LockKeyholeIcon', 'input', 'button'],
        'The eye stays nested in its button so the existing direct-SVG rule affects only the leading lock');
    }
    const disabled = render({ ...defaults, compact, revealPassword: true, disabled: true });
    assert.equal(input(disabled).props.disabled, true);
    assert.equal(toggle(disabled).props.disabled, true);
  }
});

test('default password and email fields retain their existing presentation without a reveal control', () => {
  for (const compact of [false, true]) {
    for (const props of [defaults, { ...defaults, revealPassword: false }, { ...defaults, type: 'email', autoComplete: 'email', revealPassword: true }]) {
      const tree = harness()({ ...props, compact });
      assert.equal(toggle(tree), undefined);
      assert.equal(input(tree).props.type, props.type);
      assert.equal(input(tree).props.style, undefined);
      assert.match(input(tree).props.className, /\bh-10\b/);
      assert.equal(input(tree).props.autoComplete, props.autoComplete);
      assert.equal(input(tree).props['aria-invalid'], undefined);
      assert.equal(nodes(tree).find(node => node.props['aria-live']), undefined);
      if (!compact) assert.equal(React.Children.toArray(tree.props.children)[1].type, 'input');
    }
  }
});

test('live errors use a persistent polite region while input association follows the current error', () => {
  const render = harness();
  const props = { ...defaults, id: 'confirmation', label: 'Confirm password', liveError: true, hint: 'Repeat your password.' };
  const region = tree => nodes(tree).find(node => node.props.id === 'confirmation-error');
  let tree = render(props);
  assert.equal(region(tree).props['aria-live'], 'polite');
  assert.equal(region(tree).props['aria-atomic'], true);
  assert.equal(region(tree).props.className, 'sr-only');
  assert.equal(input(tree).props['aria-describedby'], 'confirmation-hint');
  const error = 'Passwords don’t match';
  tree = render({ ...props, error });
  assert.equal(region(tree).type, 'p');
  assert.ok(React.Children.toArray(region(tree).props.children).includes(error));
  assert.equal(input(tree).props['aria-invalid'], true);
  assert.equal(input(tree).props['aria-describedby'], 'confirmation-error confirmation-hint');
  tree = render({ ...props, error: null });
  assert.equal(region(tree).props['aria-live'], 'polite');
  assert.equal(region(tree).props.className, 'sr-only');
  assert.equal(input(tree).props['aria-invalid'], undefined);
  assert.equal(input(tree).props['aria-describedby'], 'confirmation-hint');
  tree = render({ ...props, liveError: false, error });
  assert.equal(region(tree).props['aria-live'], undefined, 'Unrelated auth errors do not acquire live announcements');
  assert.equal(region(tree).props['aria-atomic'], undefined);
});
