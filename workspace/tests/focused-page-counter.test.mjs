import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const source = readFileSync(new URL('../src/components/media/FocusedPageCounter.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
let presentation = 'mobile';
const exports = {};
vm.runInNewContext(code, { exports, require(name) {
  if (name === 'react') return React;
  assert.equal(name, '../../presentation/usePresentation');
  return { usePresentation: () => presentation };
} });

test('mobile page count stays visible independently of engagement or fading page controls', () => {
  presentation = 'mobile';
  for (const showMediaInteractions of [false, true]) {
    const counter = exports.FocusedPageCounter({ current: 2, total: 5, showMediaInteractions });
    assert.equal(counter.props['aria-label'], 'Page 2 of 5');
    assert.equal(counter.props['data-focused-page-count'], '');
    assert.equal(counter.props['data-viewer-page-control'], undefined);
  }
});

test('WEB retains its existing inline engagement counter and read-only fallback', () => {
  presentation = 'web';
  assert.equal(exports.FocusedPageCounter({ current: 1, total: 5, showMediaInteractions: true }), null);
  const counter = exports.FocusedPageCounter({ current: 1, total: 5, showMediaInteractions: false });
  assert.equal(counter.props['data-viewer-page-control'], '');
  assert.match(counter.props.className, /bottom-3 left-1\/2/);
});
