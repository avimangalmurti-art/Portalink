import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'react') return React;
    if (name.endsWith('/projectGridDensity')) return { DEFAULT_PROJECT_GRID_COLUMNS: 2, MIN_PROJECT_GRID_COLUMNS: 2, MAX_PROJECT_GRID_COLUMNS: 13 };
    throw new Error(name);
  } });
  return exports;
}

test('desktop layout exposes every supported density and reset through the existing callback', () => {
  const { WebGalleryControls } = load('../src/presentation/web/WebGalleryControls.tsx');
  const changes = [];
  const tree = WebGalleryControls({ columns: 5, onChange: value => changes.push(value) });
  assert.deepEqual(nodes(tree).filter(node => node.type === 'option').map(node => node.props.value), Array.from({ length: 12 }, (_, index) => index + 2));
  const select = nodes(tree).find(node => node.type === 'select');
  assert.equal(select.props.value, 5);
  assert.equal(select.props['aria-label'], 'Projects per row');
  select.props.onChange({ target: { value: '8' } });
  nodes(tree).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(changes, [8, 2]);
  assert.equal(nodes(WebGalleryControls({ columns: 2, onChange() {} })).find(node => node.type === 'button').props.disabled, true);
});

test('desktop gallery control is absent on mobile, empty galleries and profile reorder', () => {
  for (const presentation of ['web', 'mobile']) for (const hasItems of [false, true]) for (const enabled of [false, true]) {
    const chooseColumns = () => {};
    const { JustifiedImageWall } = load('../src/components/profile/JustifiedImageWall.tsx', {
      react: { ...React, useMemo: fn => fn() },
      '../../hooks/useElementSize': { useElementSize: () => ({ width: 1000 }) },
      '../../hooks/useContentZoom': { useContentZoom: () => ({ columns: 4, chooseColumns }) },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../presentation/web/WebGalleryControls': { WebGalleryControls: 'web-controls' },
      '../../presentation/mobile/MobileGalleryControls': { MobileGalleryControls: 'mobile-controls' },
      '../ui/ZoomReadout': { ZoomReadout: 'zoom' },
      './ImageWallLayout': { ImageWallRows: 'rows', WALL_GAP: 4 },
    });
    const tree = JustifiedImageWall({ items: hasItems ? [{ key: 'a', ratio: 1, content: 'A' }] : [], columns: 4, label: 'Projects', reorderMode: { enabled } });
    const web = nodes(tree).find(node => node.type === 'web-controls');
    const mobile = nodes(tree).find(node => node.type === 'mobile-controls');
    assert.equal(Boolean(web), presentation === 'web' && hasItems && !enabled);
    assert.equal(Boolean(mobile), presentation === 'mobile' && hasItems && !enabled);
    if (web) assert.equal(web.props.onChange, chooseColumns);
  }
});
