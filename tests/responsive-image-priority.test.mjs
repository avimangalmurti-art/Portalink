import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function harness({ bounds = { left: 16, top: 180, width: 180, height: 240, right: 196, bottom: 420 }, viewport = { width: 390, height: 844 } } = {}) {
  let cursor = 0, resize;
  const state = [], effects = [];
  const react = { ...React,
    useRef: () => ({ current: { getBoundingClientRect: () => bounds } }),
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }];
    },
    useLayoutEffect: effect => effects.push(effect),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/ui/ResponsiveImage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: () => react,
    window: { visualViewport: viewport, innerWidth: 1280, innerHeight: 900 },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() { /* Measurement is explicitly triggered by the harness. */ } disconnect() { /* No real observer is registered. */ } },
  });
  return {
    render(props = {}) { cursor = 0; return exports.ResponsiveImage({ src: '/cover-800.webp', srcSet: '/cover-200.webp 200w, /cover-400.webp 400w, /cover-800.webp 800w', alt: 'Portfolio artwork', width: 800, height: 800, ...props }); },
    layout() { effects.splice(0).forEach(effect => effect()); },
    resize(next) { Object.assign(bounds, next); resize(); },
  };
}

test('first-screen thumbnail gets measured candidates and eager/high before any source is exposed', () => {
  const h = harness();
  const props = { priority: 'viewport', measureWidth: true, sizes: '90vw' };
  const first = h.render(props);
  assert.equal(first.props.src, undefined);
  assert.equal(first.props.srcSet, undefined);
  h.layout();
  const measured = h.render(props);
  assert.equal(measured.props.src, '/cover-800.webp');
  assert.equal(measured.props.sizes, '180px');
  assert.equal(measured.props.loading, 'eager');
  assert.equal(measured.props.fetchpriority, 'high');
  assert.equal('fetchPriority' in measured.props, false, 'React 18 must never receive the unrecognized camel-case DOM prop');
  const markup = renderToStaticMarkup(measured);
  assert.match(markup, /loading="eager"/);
  assert.match(markup, /fetchpriority="high"/);
  h.layout();
  h.resize({ width: 303.2, right: 319.2 });
  assert.equal(h.render(props).props.sizes, '304px', 'Density/sidebar updates use the actual tile size');
});

test('below-fold and offscreen cards retain native lazy loading without high priority', () => {
  for (const bounds of [
    { left: 16, right: 196, top: 900, bottom: 1100, width: 180, height: 200 },
    { left: 16, right: 196, top: -300, bottom: 0, width: 180, height: 300 },
    { left: 390, right: 570, top: 200, bottom: 400, width: 180, height: 200 },
  ]) {
    const h = harness({ bounds });
    const props = { priority: 'viewport', measureWidth: true };
    assert.equal(h.render(props).props.src, undefined);
    h.layout();
    const image = h.render(props);
    assert.equal(image.props.src, '/cover-800.webp');
    assert.equal(image.props.loading, 'lazy');
    assert.equal(image.props.fetchpriority, undefined);
    h.layout();
    h.resize({ top: 100, bottom: 300, left: 16, right: 196 });
    assert.equal(h.render(props).props.fetchpriority, undefined, 'Scrolling does not promote every later card to high network priority');
  }
});

test('partially visible cards use the visual viewport and zero-size images wait until revealed', () => {
  const h = harness({ bounds: { left: 16, right: 196, top: 840, bottom: 1080, width: 180, height: 240 } });
  h.render({ priority: 'viewport' }); h.layout();
  assert.equal(h.render({ priority: 'viewport' }).props.loading, 'eager');
  const hidden = harness({ bounds: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 } });
  hidden.render({ priority: 'viewport' }); hidden.layout();
  assert.equal(hidden.render({ priority: 'viewport' }).props.src, undefined);
  hidden.resize({ left: 16, right: 196, top: 180, bottom: 420, width: 180, height: 240 });
  assert.equal(hidden.render({ priority: 'viewport' }).props.loading, 'eager');
});

test('picture candidates wait for the same measurement as the fallback image', () => {
  const h = harness();
  const props = { priority: 'viewport', measureWidth: true, sources: [{ type: 'image/avif', srcSet: '/cover.avif 400w' }] };
  const first = h.render(props);
  assert.equal(first.props.children[0][0].props.srcSet, undefined);
  h.layout();
  const ready = h.render(props);
  assert.equal(ready.props.children[0][0].props.srcSet, '/cover.avif 400w');
  assert.equal(ready.props.children[0][0].props.sizes, '180px');
  assert.equal(ready.props.children[1].props.fetchpriority, 'high');
});

test('all supported grid densities size mixed-aspect thumbnails from the actual packing geometry', () => {
  const source = readFileSync(new URL('../src/components/profile/JustifiedImageWall.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('wall.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const pack = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'packRows');
  assert.ok(pack);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`const GAP = 4; export ${pack.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  for (const width of [350, 390, 976]) for (let columns = 2; columns <= 13; columns++) {
    const items = Array.from({ length: columns }, (_, i) => ({ key: String(i), ratio: [612 / 792, 1.6, 1][i % 3] }));
    const [row] = exports.packRows(items, width, columns, width / columns / .82);
    assert.equal(row.items.length, columns);
    for (const item of row.items) {
      const h = harness({ bounds: { left: 0, right: item.width, top: 100, bottom: 100 + row.height, width: item.width, height: row.height } });
      const props = { priority: 'viewport', measureWidth: true };
      h.render(props); h.layout(); const image = h.render(props);
      assert.equal(image.props.sizes, `${Math.ceil(item.width)}px`, `${width}px / ${columns} columns / ${item.ratio}`);
      assert.equal(image.props.srcSet, '/cover-200.webp 200w, /cover-400.webp 400w, /cover-800.webp 800w');
      assert.equal(image.props.fetchpriority, 'high');
    }
  }
});

test('ordinary images retain their existing lazy behavior and explicit priorities use lowercase DOM attributes', () => {
  const h = harness();
  const ordinary = h.render();
  assert.equal(ordinary.props.src, '/cover-800.webp');
  assert.equal(ordinary.props.loading, 'lazy');
  assert.equal(ordinary.props.fetchpriority, undefined);
  for (const fetchPriority of ['low', 'auto', 'high']) {
    const image = h.render({ fetchPriority });
    assert.equal(image.props.fetchpriority, fetchPriority);
    assert.equal('fetchPriority' in image.props, false);
  }
  const avatar = h.render({ priority: true, fetchPriority: 'low' });
  assert.equal(avatar.props.loading, 'eager');
  assert.equal(avatar.props.fetchpriority, 'high');
});
