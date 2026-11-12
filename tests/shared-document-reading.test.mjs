import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
function jsxExpression(path, tag, attribute) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === tag) {
      const value = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(file) === attribute)?.initializer?.expression.getText(file);
      if (value) expression = value;
    }
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(expression); return expression;
}

test('MOBILE uses its explicit local density while WEB keeps authored density', () => {
  const expression = jsxExpression('../src/components/media/ProjectMediaViewer.tsx', 'AttachmentRenderer', 'imageColumns');
  for (const isMobileViewer of [false, true]) for (const kind of ['document', 'image', 'video']) for (const normalizedPagesPerRow of [1, 3, 7]) for (const mobilePagesPerRow of [1, 2, 5]) {
    const isVerticalReading = isMobileViewer && ['document', 'image'].includes(kind);
    const actual = vm.runInNewContext(expression, { isVerticalReading, mobilePagesPerRow, hasPageLayout: true, normalizedPagesPerRow });
    assert.equal(actual, isVerticalReading ? mobilePagesPerRow : normalizedPagesPerRow);
  }
});

test('single-column rendered documents retain vertical reading and the existing double-tap focus', () => {
  let cursor = 0, now = 1000; const state = [], writes = [];
  const react = { ...React, useEffect() { /* No asynchronous document reads in this fixture. */ }, useLayoutEffect() { /* No DOM layout in this fixture. */ }, useCallback: fn => fn,
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial;
      return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('../src/components/media/DocumentAttachment.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, performance: { now: () => now }, require(name) {
    if (name === 'react') return react;
    if (name === './useSinglePageZoom') return { useSinglePageZoom: () => 1 };
    if (name === './useDocumentReadingScroll') return { useDocumentReadingScroll() {} };
    if (name === './useFocusedPageSwipe') return { useFocusedPageSwipe: () => ({ isMobile: true, swipeStyle: {}, swipeHandlers: {} }) };
    if (name === './viewerMemory') return { readViewerMemory: () => ({focusedPageNumber: 1}), updateViewerMemory: (key, patch) => writes.push({ key, patch }) };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value, MAX_PAGES_PER_ROW: 7 };
    if (name === './DocumentGridPreview') return {DocumentGridPreview:'document-grid-preview'};
    if (name === './PdfImageDocument') return { PdfImageDocument: 'live-pdf' };
    if (name === './useMobileMediaRecovery') return { useMobileMediaRecovery: () => () => undefined };
    return new Proxy({}, { get: () => 'control' });
  } });
  const attachment = { id: 'pdf', displayName: 'Report', sourceUrl: 'report.pdf', metadata: { renderedPages: [1, 2, 3].map(index => ({ withinDocumentIndex: index, sourceUrl: `page-${index}.png`, storagePath: `page-${index}`, width: 600, height: 900 })) } };
  const render = props => { cursor = 0; return exports.DocumentAttachment({ attachment, projectId: 'project', memoryScope: 'shared', columns: 1, verticalReading: true, ...props }); };
  const tree = render();
  const list = nodes(tree).find(node => node.type === 'ol');
  assert.equal(list.props.style.gridTemplateColumns, 'repeat(1, minmax(0, 1fr))');
  const pageImages = tree => nodes(tree).filter(node => node.type === 'img' || node.type?.name === 'RecoverableDocumentImage');
  assert.equal(pageImages(list).length, 3);
  assert.ok(pageImages(list).every(node => node.props.className.includes('w-full')), 'Pages fill width even if the stored image is small');
  const pages = pageImages(list);
  assert.equal(pages[0].props.fetchpriority, 'high');
  assert.equal(pages[1].props.fetchpriority, 'auto');
  assert.ok(pages.every(page => page.props.fetchPriority === undefined), 'React 18 receives the supported lowercase DOM attribute');
  assert.ok(nodes(tree).some(node => /overflow-y-auto/.test(node.props.className ?? '')));
  const denser = render({ columns: 2 });
  assert.equal(nodes(denser).find(node => node.type === 'ol').props.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(nodes(denser).filter(node => node.type === 'document-grid-preview').length, 3, 'explicit density keeps every page in vertical document flow');
  const firstPage = nodes(list).find(node => node.type === 'li');
  const touch = { pointerType: 'touch', clientX: 90, clientY: 100, preventDefault() { /* Synthetic touch event. */ } };
  firstPage.props.onPointerUp(touch); now += 100; firstPage.props.onPointerUp(touch);
  assert.equal(pageImages(render()).length, 1);
  assert.equal(writes.at(-1).patch.focusedPageNumber, 0);
  assert.match(writes.at(-1).key, /^shared:document:/);
  const live = nodes(render({ attachment: { ...attachment, metadata: {} } })).find(node => node.type === 'live-pdf');
  assert.equal(live.props.columns, 1);
  assert.equal(live.props.verticalReading, true);
});

test('live PDF overview fits width even when the page is taller than the viewport', () => {
  const file = ts.createSourceFile('PdfImageDocument.tsx', read('../src/components/media/PdfImageDocument.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let scale;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'cssScale') scale = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(scale);
  for (const width of [390, 430]) {
    assert.equal(vm.runInNewContext(scale, { readingMode: false, isFocused: false, widthScale: width / 600, heightScale: 300 / 900 }), width / 600);
    assert.equal(vm.runInNewContext(scale, { readingMode: true, isFocused: true, widthScale: width / 600, heightScale: 300 / 900 }), width / 600);
    assert.equal(vm.runInNewContext(scale, { readingMode: false, isFocused: true, widthScale: width / 600, heightScale: 300 / 900 }), 300 / 900);
  }
});

test('saved-page links choose the actual single-page viewer on mobile while normal reading stays vertical',()=>{
 const file=ts.createSourceFile('viewer.tsx',read('../src/components/media/ProjectMediaViewer.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['mediaQuery','deepLinkedAttachmentId','singlePageNumber','explicitPageLink','isSavedSinglePage','isDocumentReading','isVerticalReading'];const initializers=new Map();
 function visit(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(file)))initializers.set(node.name.getText(file),node.initializer.getText(file));ts.forEachChild(node,visit);}visit(file);
 assert.equal(initializers.size,names.length);
 const code=names.map(name=>`const ${name}=${initializers.get(name)};`).join('\n')+'result={isSavedSinglePage,isDocumentReading,isVerticalReading};';
 const evaluate=(search,kind='document',isMobileViewer=true)=>{const attachment={id:'document',kind};const scope={window:{location:{search}},URLSearchParams,attachments:[attachment],active:attachment,selected:attachment,isMobileViewer};vm.runInNewContext(code,scope);return scope.result;};
 assert.equal(evaluate('?media=document&page=23&view=page').isSavedSinglePage,true);
 assert.equal(evaluate('?media=document&page=23&view=page').isVerticalReading,false);
 assert.equal(evaluate('?media=document&page=2&view=page','image').isVerticalReading,false);
 for(const search of ['', '?media=document&page=23','?media=other&page=23&view=page','?media=document&page=0&view=page','?media=document&page=bad&view=page'])assert.equal(evaluate(search).isVerticalReading,true);
 assert.equal(evaluate('?media=document&page=23&view=page','document',false).isVerticalReading,false);
});
