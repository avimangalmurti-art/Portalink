import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const ActionIcon = () => React.createElement('svg', { 'data-action-icon': true });
const Loader2Icon = () => React.createElement('svg', { 'data-loader-icon': true });
function InterfaceIcon({ icon: Icon, effect, effectActive }) {
  return React.createElement('span', { 'aria-hidden': true, 'data-effect': effectActive ? effect : undefined }, React.createElement(Icon));
}
function load(name) {
  const exports = {};
  const source = readFileSync(new URL(`../src/components/ui/${name}.tsx`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(path) {
    if (path === 'react') return React;
    if (path === 'lucide-react') return { Loader2Icon };
    if (path === './InterfaceIcon') return { InterfaceIcon };
    throw new Error(`Unexpected dependency: ${path}`);
  } });
  return exports[name];
}
const Button = load('Button'), IconButton = load('IconButton');
// Exercise the real forwardRef render functions and their native button props;
// React DOM's server renderer checks the resulting accessible HTML separately.
const render = (Control, props = {}, ref = null) => Control.render(props, ref);

test('ordinary actions keep native button defaults and accessible names without pretending to be toggles', () => {
  const action = render(Button, { children: 'Keep editing' });
  assert.equal(action.type, 'button');
  assert.equal(action.props.type, 'button');
  assert.equal(action.props.disabled, false);
  assert.equal(action.props['aria-busy'], undefined);
  assert.equal(action.props['aria-pressed'], undefined);
  assert.equal(action.props['data-control-size'], 'md');
  assert.equal(action.props['data-control-variant'], 'secondary');
  const icon = render(IconButton, { label: 'Close dialog', icon: ActionIcon });
  assert.equal(icon.props['aria-label'], 'Close dialog');
  assert.equal(icon.props.title, 'Close dialog');
  assert.equal(icon.props['aria-pressed'], undefined);
  assert.equal(icon.props['data-control-variant'], 'ghost');
  assert.match(renderToStaticMarkup(icon), /aria-label="Close dialog"/);
});

test('native forms, focus refs, events and styling hooks survive both primitive wrappers', () => {
  for (const Control of [Button, IconButton]) {
    const calls = [], ref = React.createRef();
    const onKeyDown = event => calls.push(['key', event.key]);
    const node = render(Control, { children: 'Save', label: 'Save', icon: ActionIcon,
      id: 'save-project', type: 'submit', form: 'project-form', name: 'intent', value: 'save',
      className: 'project-action', tabIndex: -1, onClick: event => calls.push(['click', event.currentTarget]), onKeyDown,
      'aria-describedby': 'save-help', 'aria-controls': 'project-form', 'data-feature': 'publisher',
    }, ref);
    assert.equal(node.ref, ref);
    for (const [key, value] of Object.entries({ id: 'save-project', type: 'submit', form: 'project-form', name: 'intent', value: 'save', tabIndex: -1, 'aria-describedby': 'save-help', 'aria-controls': 'project-form', 'data-feature': 'publisher' })) assert.equal(node.props[key], value);
    assert.ok(node.props.className.includes('project-action'));
    assert.equal(node.props.onKeyDown, onKeyDown);
    node.props.onClick({ currentTarget: 'submit-control' });
    node.props.onKeyDown({ key: 'Escape' });
    assert.deepEqual(calls, [['click', 'submit-control'], ['key', 'Escape']]);
  }
});

test('disabled and loading actions block activation while keeping their names and busy semantics', () => {
  for (const Control of [Button, IconButton]) for (const state of [{ disabled: true }, { isLoading: true }, { disabled: true, isLoading: true }]) {
    const node = render(Control, { children: 'Save project', label: 'Save project', icon: ActionIcon, onClick: () => assert.fail('A blocked action must not activate'), ...state });
    assert.equal(node.props.disabled, true);
    assert.equal(node.props.onClick, undefined);
    assert.equal(node.props['aria-busy'], state.isLoading || undefined);
    const html = renderToStaticMarkup(node);
    assert.match(html, /disabled=""/);
    assert.match(html, /Save project/);
    if (state.isLoading) {
      assert.match(html, /aria-busy="true"/);
      assert.match(html, /data-loader-icon/);
      assert.doesNotMatch(html, /data-action-icon/);
    }
  }
});

test('controlled icon toggles announce both false and true while ordinary actions omit pressed state', () => {
  for (const isSelected of [false, true]) {
    const node = render(IconButton, { label: 'Show project list', icon: ActionIcon, isSelected });
    assert.equal(node.props['aria-pressed'], isSelected);
    assert.match(renderToStaticMarkup(node), new RegExp(`aria-pressed="${isSelected}"`));
  }
  const mixed = render(IconButton, { label: 'Select items', icon: ActionIcon, 'aria-pressed': 'mixed' });
  assert.equal(mixed.props['aria-pressed'], 'mixed');
  const ordinary = render(IconButton, { label: 'Close', icon: ActionIcon });
  assert.doesNotMatch(renderToStaticMarkup(ordinary), /aria-pressed/);
});

test('open menus and radio choices keep native accessible state without acquiring toggle semantics', () => {
  const menu = render(IconButton, { label: 'Project options', icon: ActionIcon, 'aria-haspopup': 'menu', 'aria-expanded': true, 'aria-controls': 'project-menu' });
  assert.equal(menu.props['aria-haspopup'], 'menu');
  assert.equal(menu.props['aria-expanded'], true);
  assert.equal(menu.props['aria-pressed'], undefined);
  const radio = render(Button, { children: 'Dark', role: 'radio', 'aria-checked': true, tabIndex: 0 });
  assert.match(renderToStaticMarkup(radio), /role="radio"/);
  assert.match(renderToStaticMarkup(radio), /aria-checked="true"/);
  assert.equal(radio.props['aria-pressed'], undefined);
});

test('every size and semantic variant reaches the shared contract without stale utility state classes', () => {
  for (const Control of [Button, IconButton]) for (const size of ['sm', 'md', 'lg']) for (const variant of ['secondary', 'ghost', 'primary', 'danger']) {
    const node = render(Control, { children: 'Continue', label: 'Continue', icon: ActionIcon, size, variant, 'aria-busy': true });
    assert.equal(node.props['data-ui-control'], Control === Button ? 'button' : 'icon');
    assert.equal(node.props['data-control-size'], size);
    assert.equal(node.props['data-control-variant'], variant);
    assert.equal(node.props['aria-busy'], true);
    assert.doesNotMatch(node.props.className ?? '', /(?:hover:|active:|rounded-\[|disabled:opacity)/);
  }
  assert.match(render(Button, { children: 'Continue', fullWidth: true }).props.className, /\bw-full\b/);
});
