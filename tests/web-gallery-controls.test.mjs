import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
function load(path, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, ...globals, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'react') return React;
    if (name.endsWith('/projectGridDensity')) return density;
    throw new Error(name);
  } });
  return exports;
}
const density = load('../src/utils/projectGridDensity.ts');

test('desktop layout exposes the existing density slider and reset through one commit callback', () => {
  const { WebGalleryControls } = load('../src/presentation/web/WebGalleryControls.tsx', { '../../components/ui/DensitySeparator': { DensitySeparator: 'density-separator' } });
  const changes = [];
  const tree = WebGalleryControls({ columns: 5, onChange: value => changes.push(value) });
  assert.equal(tree.props['aria-label'], 'Gallery layout');
  assert.equal(nodes(tree).some(node => node.type === 'select'), false);
  const slider = nodes(tree).find(node => node.type === 'density-separator');
  assert.equal(slider.props.columns, 5);
  assert.equal(slider.props.label, 'Projects per row');
  assert.equal(slider.props.onPreview, undefined, 'Drag previews must not call the persistence callback');
  slider.props.onChange(1);
  slider.props.onChange(13);
  nodes(tree).find(node => node.type === 'button').props.onClick();
  assert.deepEqual(changes, [1, 13, 2]);
  assert.equal(nodes(WebGalleryControls({ columns: 2, onChange() {} })).find(node => node.type === 'button').props.disabled, true);
  assert.equal(nodes(WebGalleryControls({ columns: 1, onChange() {} })).find(node => node.type === 'button').props.disabled, false);
});

test('actual desktop thumb movement stays continuous and commits one integer only on release', () => {
  const changes = [], frames = new Map(); let nextFrame = 0;
  const { DensitySeparator } = load('../src/components/ui/DensitySeparator.tsx', {
    react: { ...React, useRef: current => ({ current }), useEffect() {}, startTransition: callback => callback() },
    '../../presentation/usePresentation': { usePresentation: () => 'web' }, './density-separator.css': {},
  }, { requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id) });
  const { WebGalleryControls } = load('../src/presentation/web/WebGalleryControls.tsx', { '../../components/ui/DensitySeparator': { DensitySeparator } });
  const tree = WebGalleryControls({ columns: 5, onChange: value => changes.push(value) });
  const slider = DensitySeparator(nodes(tree).find(node => node.type === DensitySeparator).props);
  const input = { value: '5', style: { setProperty() {} } }; slider.ref.current = input;
  assert.equal(slider.props.min, 1); assert.equal(slider.props.max, 13); assert.equal(slider.props.step, 'any');
  slider.props.onPointerDown({ pointerType: 'mouse', stopPropagation() {} });
  for (const value of ['5.2', '7.6', '8.1']) {
    input.value = value; slider.props.onChange({ currentTarget: input });
    const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback());
    assert.equal(input.value, value); assert.deepEqual(changes, []);
  }
  slider.props.onPointerUp({ stopPropagation() {} });
  slider.props.onBlur();
  assert.equal(input.value, '8'); assert.deepEqual(changes, [8]);
});

test('WEB feed controls use the existing zoom choice for saved Home and adaptive local city layouts', () => {
  for (const presentation of ['web', 'mobile']) for (const savedColumns of [undefined, 5]) {
    const choices = [], saved = [];
    const onColumnsChange = savedColumns === undefined ? undefined : value => saved.push(value);
    const view = { columns: savedColumns ?? 6, ref: { current: null }, chooseColumns(value) { choices.push(value); onColumnsChange?.(value); } };
    let zoomArgs;
    const { BentoFeedGrid } = load('../src/components/home/BentoFeedGrid.tsx', {
      react: { ...React, useCallback: callback => callback, useEffect() {}, useLayoutEffect() {}, useRef: current => ({ current }), useState: value => [value, () => {}] },
      '../../presentation/motion/motion': { motionSeconds: () => 0, motionCurve: () => [] },
      'framer-motion': { motion: { div: 'motion-div' }, useReducedMotion: () => true },
      '../../utils/bentoLayout': { layoutBento() {} },
      '../../hooks/useElementSize': { useElementSize: () => ({ ref: { current: null }, width: 1000 }) },
      '../../hooks/useContentZoom': { useContentZoom: (...args) => { zoomArgs = args; return view; } },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../presentation/web/WebGalleryControls': { WebGalleryControls: 'web-controls' },
      '../ui/ZoomReadout': { ZoomReadout: 'zoom' },
      '../profile/ProjectPageBrowsingContext': { ProjectPageBrowsingProvider: 'page-browsing' },
    });
    const tree = BentoFeedGrid({ items: [{ key: 'project', content: 'Project' }], columns: savedColumns, onColumnsChange });
    assert.equal(zoomArgs[0], savedColumns ?? 6); assert.equal(zoomArgs[2], savedColumns); assert.equal(zoomArgs[3], onColumnsChange);
    const controls = nodes(tree).find(node => node.type === 'web-controls');
    assert.equal(Boolean(controls), presentation === 'web');
    if (controls) {
      assert.equal(controls.props.columns, view.columns); assert.equal(controls.props.onChange, view.chooseColumns);
      controls.props.onChange(9); assert.deepEqual(choices, [9]); assert.deepEqual(saved, savedColumns === undefined ? [] : [9]);
    }
    assert.equal(nodes(tree).find(node => node.props['data-project-grid-columns'] !== undefined).props['data-project-grid-columns'], view.columns);
  }
});

test('layout controls remain desktop-only while shared galleries retain local card zoom', () => {
  for (const presentation of ['web', 'mobile']) for (const hasItems of [false, true]) for (const enabled of [false, true]) for (const allowLayoutControls of [false, true]) {
    const chooseColumns = () => {};
    const onColumnsChange = () => {};
    let gesturesEnabled;
    let zoomCallback;
    const { JustifiedImageWall } = load('../src/components/profile/JustifiedImageWall.tsx', {
      react: { ...React, useMemo: fn => fn(), useRef: initial => ({ current: initial }) },
      '../../hooks/useElementSize': { useElementSize: () => ({ width: 1000 }) },
      '../../hooks/useContentZoom': { useContentZoom: (_columns, enabled, _resetKey, onChange) => { gesturesEnabled = enabled; zoomCallback = onChange; return { columns: 5, chooseColumns }; } },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../presentation/web/WebGalleryControls': { WebGalleryControls: 'web-controls' },
      '../ui/ZoomReadout': { ZoomReadout: 'zoom' },
      './ImageWallLayout': { ImageWallRows: 'rows', WALL_GAP: 4 },
      './ProjectPageBrowsingContext': { ProjectPageBrowsingProvider: 'page-browsing' },
    });
    const tree = JustifiedImageWall({ items: hasItems ? [{ key: 'a', ratio: 1, content: 'A' }] : [], columns: 4, label: 'Projects', onColumnsChange, reorderMode: { enabled }, allowLayoutControls });
    const web = nodes(tree).find(node => node.type === 'web-controls');
    const mobile = nodes(tree).find(node => node.type === 'mobile-controls');
    assert.equal(Boolean(web), allowLayoutControls && presentation === 'web' && hasItems && !enabled);
    assert.equal(Boolean(mobile), false);
    assert.equal(gesturesEnabled, !enabled);
    assert.equal(zoomCallback, onColumnsChange, 'Shared viewing retains its local density callback');
    assert.equal(nodes(tree).find(node => node.props?.role === 'list').props['data-profile-wall-columns'], 5, 'The wall uses the zoom selection even when layout chrome is hidden');
    assert.equal(nodes(tree).some(node => node.type === 'zoom'), allowLayoutControls);
    if (web) assert.equal(web.props.onChange, chooseColumns);
  }
});

test('a header-owned density control hides only WEB gallery controls and preserves zoom feedback', () => {
  for (const { presentation, allowLayoutControls, showDensityControl, hasControls, hasReadout } of [
    { presentation: 'web', allowLayoutControls: true, hasControls: true, hasReadout: true },
    { presentation: 'web', allowLayoutControls: true, showDensityControl: false, hasControls: false, hasReadout: true },
    { presentation: 'mobile', allowLayoutControls: true, hasControls: false, hasReadout: true },
    { presentation: 'mobile', allowLayoutControls: true, showDensityControl: false, hasControls: false, hasReadout: true },
    { presentation: 'web', allowLayoutControls: false, hasControls: false, hasReadout: false },
    { presentation: 'web', allowLayoutControls: false, showDensityControl: false, hasControls: false, hasReadout: false },
  ]) {
    const onColumnsChange = () => {};
    const view = { columns: 7, ref: { current: null }, chooseColumns() {} };
    let zoomArgs;
    const { JustifiedImageWall } = load('../src/components/profile/JustifiedImageWall.tsx', {
      react: { ...React, useMemo: fn => fn(), useRef: current => ({ current }) },
      '../../hooks/useElementSize': { useElementSize: () => ({ width: 1000 }) },
      '../../hooks/useContentZoom': { useContentZoom: (...args) => { zoomArgs = args; return view; } },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../presentation/web/WebGalleryControls': { WebGalleryControls: 'web-controls' },
      '../ui/ZoomReadout': { ZoomReadout: 'zoom' },
      './ImageWallLayout': { ImageWallRows: 'rows', WALL_GAP: 4 },
      './ProjectPageBrowsingContext': { ProjectPageBrowsingProvider: 'page-browsing' },
    });
    const tree = JustifiedImageWall({
      items: [{ key: 'a', ratio: 1, content: 'A' }], columns: 4, label: 'Projects', onColumnsChange, allowLayoutControls,
      ...(showDensityControl === undefined ? {} : { showDensityControl }),
    });
    assert.equal(nodes(tree).some(node => node.type === 'web-controls'), hasControls);
    const readout = nodes(tree).find(node => node.type === 'zoom');
    assert.equal(Boolean(readout), hasReadout);
    if (readout) assert.equal(readout.props.view, view);
    assert.deepEqual(zoomArgs.slice(0, 3), [4, true, 4], 'The flag does not disable local zoom or change its reset scope');
    assert.equal(zoomArgs[3], onColumnsChange);
    assert.equal(tree.ref, view.ref);
    assert.equal(nodes(tree).find(node => node.props?.role === 'list').props['data-profile-wall-columns'], 7);
  }
});
