import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Exercise the real dialog's completion boundary without a browser, network
// calls, or publishing test projects. Service state and hook scheduling are
// controlled here; the actual component/effect code is compiled unchanged.
const source = readFileSync(new URL('../src/features/publishing/PublishProjectDialog.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;

function harness() {
  let currentFlow;
  let effects = [];
  let cursor = 0;
  const refs = [];
  const calls = [];
  const stubReact = { ...React,
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useState: (value) => [value, () => undefined],
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'react') return stubReact;
      if (name === 'framer-motion') return { AnimatePresence: React.Fragment, motion: { div: 'div', section: 'section' }, useReducedMotion: () => true };
      if (name === './usePublishProject') return { usePublishProject: () => currentFlow };
      if (name === './validation') return { TITLE_MAX_LENGTH: 80 };
      return new Proxy({}, { get: (_, key) => key });
    },
    document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  const props = { isOpen: true, profileId: 'creator', categoryId: 'category', categoryLabel: 'Typography',
    onClose: () => undefined, onPublished: (result, title) => calls.push({ result, title }),
  };
  function render(changes = {}, propChanges = {}) {
    currentFlow = {
      step: 'metadata', state: 'editing', isDirty: true, isOwner: true, draft: {},
      media: { items: [] }, metadata: { title: ' Wet Paint ', summary: '' }, fieldErrors: {},
      inferredRelevance: {}, upload: {}, publish: {}, ...changes,
    };
    cursor = 0;
    effects = [];
    const tree = exports.PublishProjectDialog({ ...props, ...propChanges });
    effects.forEach((effect) => effect());
    return tree;
  }
  return { render, calls };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const published = { projectId: 'new-project', mediaPersisted: true, sessionOnly: false };

test('confirmed publication removes the entire modal and announces once', () => {
  const h = harness();
  assert.equal(h.render({ step: 'done', state: 'published', result: published }), null);
  h.render({ step: 'done', state: 'published', result: published });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].result, published);
  assert.equal(h.calls[0].title, 'Wet Paint');
});

test('uploaded files alone do not close the publishing form', () => {
  const h = harness();
  const tree = h.render({ state: 'publishing', upload: { phase: 'uploaded' } });
  assert.equal(tree.props.titleId, 'publish-dialog-title');
  assert.equal(h.calls.length, 0);
});

test('disabled Publish explains the missing detail, then clears the helper when ready', () => {
  for (const [title, summary, expected] of [
    ['  ', '', 'Add a title to publish.'],
    ['My project', '  ', 'Add a description to publish.'],
  ]) {
    const tree = harness().render({ metadata: { title, summary }, canPublish: false, media: { items: [{}] } });
    assert.ok(nodes(tree).some((node) => node.props?.role === 'status' && node.props.children === expected));
    assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, true);
  }
  const tree = harness().render({ metadata: { title: 'My project', summary: 'About the work' }, canPublish: true, media: { items: [{}] } });
  assert.equal(nodes(tree).find((node) => node.props?.type === 'submit').props.disabled, false);
  assert.ok(!nodes(tree).some((node) => node.props?.role === 'status'));
  assert.ok(nodes(tree).some((node) => node.props?.id === 'publish-details-label' && node.props.children === 'Project details'));
});

test('publishing accepts the complete long description without an input cap', () => {
  const summary = 'First paragraph — café 🌍\n\nSecond paragraph.\n'.repeat(2500);
  const tree = harness().render({ metadata: { title: 'Long-form project', summary } });
  const fields = nodes(tree);
  const description = fields.find((node) => node.props?.id === 'publish-summary');
  assert.equal(description.props.maxLength, undefined);
  assert.equal(description.props.value, summary);
  assert.equal(fields.find((node) => node.props?.id === 'publish-title').props.maxLength, 80);
});

test('upload and publication errors keep the dialog and recovery message', () => {
  for (const failure of [
    { upload: { failure: { message: 'Upload failed' } } },
    { publish: { status: 'error', error: 'Publication failed' } },
  ]) {
    const h = harness();
    const tree = h.render({ state: 'failed', ...failure });
    assert.equal(tree.props.titleId, 'publish-dialog-title');
    assert.ok(nodes(tree).some((node) => node.props?.role === 'alert'));
    assert.equal(h.calls.length, 0);
  }
});

test('closed or incomplete flows never emit a successful result', () => {
  const h = harness();
  h.render({ step: 'done', result: published }, { isOpen: false });
  h.render({ upload: { phase: 'cancelled' } });
  assert.equal(h.calls.length, 0);
});

test('a later publication can announce and prototype results retain their warning flags', () => {
  const h = harness();
  h.render({ step: 'done', result: published });
  h.render({}, { isOpen: false });
  const prototype = { projectId: 'session-project', mediaPersisted: false, sessionOnly: true };
  h.render({ step: 'done', result: prototype });
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].result, prototype);
});
