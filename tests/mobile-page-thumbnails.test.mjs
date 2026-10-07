import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function load() {
  const scrolling = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/projectPageScroll.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: scrolling, getComputedStyle: element => ({ overflowY: element.overflow ?? 'visible' }) });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobilePageThumbnails.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: name => {
    if (name === './projectPageScroll') return scrolling;
    assert.equal(name, 'react'); return { ...React, useRef: () => ({ current: null }), useLayoutEffect() {} };
  }, getComputedStyle: element => ({ overflowY: element.overflow ?? 'visible' }) });
  return exports.MobilePageThumbnails;
}

test('thumbnail navigation scrolls the nested renderer without scrolling the app or expanding content', () => {
  const jumps = [];
  const scroller = { overflow: 'auto', scrollHeight: 4000, clientHeight: 700, scrollTop: 250,
    getBoundingClientRect: () => ({ top: 10 }), scrollTo: value => jumps.push(value) };
  const wrapper = { parentElement: scroller };
  const page = { parentElement: wrapper, getBoundingClientRect: () => ({ top: 830 }) };
  const surface = { querySelector: selector => selector === '[data-project-page-number="3"]' ? page : null,
    contains: node => node === scroller || node === wrapper };
  const tree = load()({ id: 'pages', current: 1, total: 3, surfaceRef: { current: surface }, previewSources: ['one', 'two', 'three'], pdfDocument: null });
  const third = tree.props.children[2];
  assert.equal(third.props['aria-label'], 'Go to page 3');
  assert.equal(third.props.children[0].props.source, 'three');
  third.props.onClick();
  assert.equal(jumps.length, 1); assert.equal(jumps[0].top, 1070); assert.equal(jumps[0].behavior, 'instant');
  tree.props.children[0].props.onClick(); assert.equal(jumps.length, 1, 'a removed page is safe');
});

test('all PDF previews reuse the viewer document and preserve page order and current-page semantics', () => {
  const pdfDocument = { numPages: 20 };
  const tree = load()({ id: 'pages', current: 12, total: 20, surfaceRef: { current: null }, previewSources: [], pdfDocument });
  assert.equal(tree.props.children.length, 20);
  assert.equal(tree.props.children[11].props['aria-current'], 'page');
  tree.props.children.forEach((node, index) => {
    assert.equal(node.props.children[0].props.pdfDocument, pdfDocument);
    assert.equal(node.props.children[0].props.number, index + 1);
    node.props.onClick(); // A document disappearing during navigation is harmless.
  });
});
