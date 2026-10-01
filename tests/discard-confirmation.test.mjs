import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, React, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  return exports;
}
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}

test('discard layer focuses the safe enabled action after registering its nested trap and consumes backdrop presses', () => {
  const effects = [], calls = [];
  let trap, kept = 0;
  const { DiscardConfirmationLayer } = compile('../src/components/ui/DiscardConfirmationLayer.tsx', {
    react: { ...React, useRef: initial => ({ current: initial }), useEffect: effect => effects.push(effect) },
    '../../hooks/useModalFocus': { useModalFocus(open, ref, onEscape, preventScroll) {
      trap = { open, ref, onEscape, preventScroll };
      effects.push(() => calls.push('register trap'));
    } },
  });
  const tree = DiscardConfirmationLayer({ label: 'Discard edits?', onKeep: () => { kept++; },
    children: React.createElement('button', { type: 'button' }, 'Keep editing') });
  const dialog = nodes(tree).find(node => node.props.role === 'alertdialog');
  assert.equal(trap.ref, dialog.ref);
  assert.equal(trap.open, true);
  assert.equal(trap.preventScroll, true);
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.equal(dialog.props['aria-label'], 'Discard edits?');
  assert.match(tree.props.className, /\babsolute\b.*\binset-0\b/, 'Uses the parent visible-viewport overlay, not a separate layout viewport');
  assert.match(dialog.props.className, /max-h-full/);
  assert.match(dialog.props.className, /overflow-y-auto/);
  dialog.ref.current = { querySelector(selector) {
    assert.equal(selector, 'button:not(:disabled)');
    return { focus(options) { assert.equal(options.preventScroll, true); calls.push('focus safe action'); } };
  } };
  effects.forEach(effect => effect());
  assert.deepEqual(calls, ['register trap', 'focus safe action']);
  let stopped = 0;
  tree.props.onPointerDown({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1);
  assert.equal(kept, 0, 'Backdrop presses do not discard or dismiss');
  trap.onEscape(); assert.equal(kept, 1);
});

test('project discard confirmation stays beside the form inside its viewport and preserves busy/error actions', () => {
  const viewport = { current: null }, actions = [];
  const { ProjectFormDialog, ProjectDiscardConfirmation } = compile('../src/components/publishing/ProjectFormDialog.tsx', {
    react: { ...React, useRef: initial => ({ current: initial }) },
    'framer-motion': { motion: { div: 'motion-div', section: 'motion-section' }, useReducedMotion: () => true },
    'lucide-react': { AlertCircleIcon: 'svg', XIcon: 'svg' },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../ui/ModalPortal': { ModalPortal: 'modal-portal' },
    '../ui/InterfaceIcon': { InterfaceIcon: 'svg' },
    '../ui/Button': { Button: 'button' },
    '../ui/DiscardConfirmationLayer': { DiscardConfirmationLayer: 'discard-layer' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => viewport },
    './project-dialog.css': {},
  });
  const props = { title: 'Discard this draft?', description: 'Your files and details will be removed.',
    onKeep: () => actions.push('keep'), onDiscard: () => actions.push('discard') };
  for (const mobileFlow of [false, true]) {
    const confirmation = ProjectDiscardConfirmation(props);
    const tree = ProjectFormDialog({ title: 'New project', titleId: 'project-title', mobileFlow,
      onClose: () => actions.push('close'), confirmation, children: React.createElement('form') });
    const overlay = nodes(tree).find(node => node.type === 'motion-div');
    const form = nodes(tree).find(node => node.type === 'motion-section');
    assert.equal(overlay.ref, viewport);
    assert.equal(React.Children.toArray(overlay.props.children).some(node => node.props === confirmation.props), true);
    assert.equal(nodes(form).some(node => node.type === 'discard-layer'), false, 'Neither platform nests the confirmation in the animated form');
  }
  let confirmation = ProjectDiscardConfirmation({ ...props, busy: true });
  assert.equal(nodes(confirmation).filter(node => node.type === 'button').every(node => node.props.disabled), true);
  confirmation.props.onKeep(); assert.deepEqual(actions, [], 'Escape cannot interrupt cleanup');
  confirmation = ProjectDiscardConfirmation({ ...props, error: 'Cleanup failed; retry.' });
  assert.ok(nodes(confirmation).find(node => node.props.role === 'alert'));
  nodes(confirmation).find(node => node.type === 'button' && node.props.children === 'Try again').props.onClick();
  assert.deepEqual(actions, ['discard']);
  confirmation.props.onKeep();
  assert.deepEqual(actions, ['discard', 'keep']);
});
