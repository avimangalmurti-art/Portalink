import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const MobileReorderList = () => null;
const ProjectCover = () => null;
const ReorderGroup = () => null;
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}
function harness({ presentation = 'mobile', isOwner = false, mobileLayout, publishedAt = '2026-09-14T12:00:00Z' } = {}) {
  const exports = {};
  const react = { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: current => ({ current }), useCallback: fn => fn, useLayoutEffect() {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/ProjectIndexList.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, document: { querySelector: () => ({}), body: {} }, require(name) {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: node => node };
    if (name === 'framer-motion') return { Reorder: { Group: ReorderGroup, Item: 'li' }, useDragControls: () => ({}), AnimatePresence: () => null, motion: { div: 'div' } };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileReorderList')) return { MobileReorderList };
    if (name.endsWith('/ProjectCover')) return { ProjectCover };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: () => null };
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({}) };
    return {};
  } });
  const project = { id: 'work', title: 'Plant Cell Microscope Photography', cover: '/cover.pdf', coverAlt: 'Plant cells',
    coverKind: 'document', coverPageNumber: 3, coverAspectRatio: 0.75, coverFrame: { x: 0.4, y: 0.6, zoom: 1.2 }, publishedAt };
  const selections = [];
  const props = { projects: [project], typefaceStacks: { work: 'Custom Project Typeface' }, typefaceIds: {},
    hiddenIds: [], pinnedIds: [], activeProjectId: 'work', isOwner, mobileLayout, mobileReorderFromMenu: true,
    onSelect: id => selections.push(id), onReorder() {}, onToggleHidden() {}, onTogglePinned() {} };
  const tree = exports.ProjectIndexList(props);
  const group = nodes(tree).find(node => node.type === MobileReorderList);
  const row = group ? group.props.renderItem(project, { onTouchStart() { throw new Error('Menu-only reordering must not activate on hold'); } }, { moveUp() {} })
    : nodes(tree).find(node => node.props.project === project);
  const renderedRow = row.type(row.props);
  const label = nodes(renderedRow).find(node => node.type?.name === 'MobileProjectLabel');
  return { tree, project, row, renderedRow, label: label ? label.type(label.props) : undefined, selections };
}

test('MOBILE owner and visitor rows show the canonical cover, title, and real publication date', () => {
  for (const isOwner of [true, false]) {
    const h = harness({ isOwner });
    assert.equal(h.tree.props['data-mobile-project-layout'], 'list');
    const thumbnail = nodes(h.label).find(node => node.props.className === 'mobile-project-index-cover');
    assert.equal(thumbnail.props['aria-hidden'], 'true');
    const cover = nodes(thumbnail).find(node => node.type === ProjectCover);
    for (const [prop, projectProp] of [['source', 'cover'], ['alt', 'coverAlt'], ['kind', 'coverKind'], ['frame', 'coverFrame'], ['pageNumber', 'coverPageNumber'], ['aspectRatio', 'coverAspectRatio']]) {
      assert.equal(cover.props[prop], h.project[projectProp]);
    }
    const title = nodes(h.label).find(node => node.props.className?.startsWith('mobile-project-index-title'));
    assert.equal(title.props.children, h.project.title);
    assert.equal(title.props.style, undefined, 'Navigation uses interface typography on MOBILE');
    assert.match(title.props.className, /accent-text/);
    const date = nodes(h.label).find(node => node.type === 'time');
    assert.equal(date.props.children, 'Sep 14, 2026');
    assert.equal(date.props.dateTime, h.project.publishedAt);
    assert.equal(nodes(h.renderedRow).some(node => node.props['data-row-menu'] !== undefined), isOwner);
    const select = nodes(h.renderedRow).find(node => node.type === 'button' && node.props.title === h.project.title);
    assert.equal(select.props['aria-current'], 'true');
    assert.equal(select.props.onTouchStart, undefined, 'The navigation row retains menu-only reorder access');
    select.props.onClick();
    assert.deepEqual(h.selections, ['work']);
  }
});

test('missing and invalid publication dates are omitted without inventing metadata', () => {
  for (const publishedAt of [null, '', 'not-a-date']) {
    const h = harness({ publishedAt });
    assert.equal(nodes(h.label).some(node => node.type === 'time'), false);
    assert.ok(nodes(h.label).some(node => node.type === ProjectCover));
  }
});

test('MOBILE grid/list changes annotate the same owner and visitor navigation without changing selection', () => {
  for (const isOwner of [false, true]) {
    for (const mobileLayout of ['list', 'grid']) {
      const h = harness({ isOwner, mobileLayout });
      assert.equal(h.tree.props['data-mobile-project-layout'], mobileLayout);
      const select = nodes(h.renderedRow).find(node => node.type === 'button' && node.props.title === h.project.title);
      select.props.onClick();
      assert.deepEqual(h.selections, ['work']);
    }
  }
});

test('WEB keeps its existing title-only project typography and does not receive MOBILE layout', () => {
  for (const isOwner of [false, true]) {
    const h = harness({ presentation: 'web', isOwner, mobileLayout: 'grid' });
    assert.equal(h.tree.props['data-mobile-project-layout'], undefined);
    assert.equal(h.label, undefined);
    assert.equal(nodes(h.renderedRow).some(node => node.type === ProjectCover || node.type === 'time'), false);
    const title = nodes(h.renderedRow).find(node => node.props['data-font-preview'] !== undefined);
    assert.equal(title.props.style.fontFamily, 'Custom Project Typeface');
    assert.equal(title.props.children, h.project.title);
  }
});
