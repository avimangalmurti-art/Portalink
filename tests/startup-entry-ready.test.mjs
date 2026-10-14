import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { deferred } from './helpers/hook-harness.mjs';

test('the actual main entry announces execution before CSS waiting and mounts only after CSS is ready', async () => {
  const source = readFileSync(new URL('../src/index.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const mount = file.statements.find(statement => ts.isIfStatement(statement) && statement.expression.getText(file) === 'rootEl');
  assert.ok(mount);
  const css = deferred(), order = [], root = {}, html = { dataset: {} };
  vm.runInNewContext(ts.transpileModule(mount.getText(file), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React,
  } }).outputText, {
    rootEl: root, React, document: { documentElement: html },
    window: { dispatchEvent(event) { assert.equal(html.dataset.portalinkEntryReady, 'true'); order.push(event.type); } },
    Event: class { constructor(type) { this.type = type; } },
    waitForStartupStyles() { order.push('wait-css'); return css.promise; },
    ReactDOM: { createRoot(target) { assert.equal(target, root); order.push('create-root'); return { render() { order.push('render'); } }; } },
    BrowserRouter: 'router', RumPageView: 'rum', ServicesProvider: 'services', services: {},
    AuthProvider: 'auth', ProfileDataProvider: 'profiles', EngagementProvider: 'engagement', ApplicationBootstrap: 'bootstrap',
  });
  assert.deepEqual(order, ['portalink:main-entry-ready', 'wait-css']);
  css.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(order, ['portalink:main-entry-ready', 'wait-css', 'create-root', 'render']);
});
