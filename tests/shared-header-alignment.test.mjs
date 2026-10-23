import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import postcss from 'postcss';
import ts from 'typescript';
import React from 'react';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = postcss.parse(read('../src/index.css'));
const scope = '.codex-shell.shared-portalink-shell';
function declarations(selector) {
  const result = {};
  css.walkRules((rule) => {
    if (!rule.selectors.some((candidate) => candidate.replace(/\s+/g, ' ').trim() === selector)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}
function attributes(path, name) {
  const source = read(path);
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = [];
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === name) result.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { result, file };
}

test('main, project and details headers all opt into the public alignment contract', () => {
  const main = attributes('../src/components/profile/SharedProfileSidebar.tsx', 'data-shared-navigation-header');
  assert.equal(main.result.length, 1);
  assert.equal(main.result[0].text, '');
  const details = attributes('../src/components/media/ProjectMediaViewer.tsx', 'data-shared-navigation-header');
  assert.equal(details.result.length, 1);
  assert.equal(details.result[0].text, '');
  // Includes both collapsed document-list branches and the expanded toolbar.
  const project = attributes('../src/components/profile/ProfileCategoryPage.tsx', 'data-shared-navigation-header');
  assert.equal(project.result.length, 3);
  for (const initializer of project.result) {
    assert.ok(ts.isJsxExpression(initializer));
    const expression = initializer.expression.getText(project.file);
    assert.equal(vm.runInNewContext(expression, { sharedReadOnly: true }), '');
    assert.equal(vm.runInNewContext(expression, { sharedReadOnly: false }), undefined);
  }
});

test('all public header controls share fixed geometry without pressed-state movement', () => {
  const tokens = declarations(scope);
  assert.equal(tokens['--shared-header-height'], '64px');
  assert.equal(tokens['--shared-header-control'], '44px');
  assert.equal(tokens['--shared-header-glyph'], '24px');
  const header = declarations(`${scope} [data-shared-navigation-header]`);
  for (const size of ['height', 'min-height', 'max-height']) assert.equal(header[size], 'var(--shared-header-height)');
  assert.equal(header['padding-block'], '0');
  assert.equal(header['align-items'], 'center');
  assert.equal(header['flex-shrink'], '0');
  const row = declarations(`${scope} [data-shared-navigation-row]`);
  assert.equal(row.height, '100%');
  assert.equal(row['align-items'], 'center');
  const control = declarations(`${scope} [data-shared-navigation-header] button`);
  for (const size of ['height', 'min-height', 'max-height', 'width', 'min-width', 'max-width']) {
    assert.equal(control[size], 'var(--shared-header-control)');
  }
  assert.equal(control['box-sizing'], 'border-box');
  assert.equal(control['align-items'], 'center');
  assert.equal(control['justify-content'], 'center');
  assert.equal(control.padding, '0');
  assert.equal(control['margin-block'], '0');
  assert.equal(control.transform, 'none');
  // Every 44px control has 10px above/below it in the 64px header, regardless
  // of the rail's horizontal width or theme. This is a source-level contract,
  // not a substitute for claiming browser pixel measurements.
  assert.equal((parseInt(tokens['--shared-header-height']) - parseInt(tokens['--shared-header-control'])) / 2, 10);
});

test('project information uses the shared icon frame within the centered header control', () => {
  const source = read('../src/components/media/ProjectMediaViewer.tsx');
  assert.match(source, /<InterfaceIcon icon=\{InfoIcon\} size="lg" \/>/);
  assert.equal(source.includes('data-shared-info-glyph'), false);
});

test('project header omits duplicate page totals but retains layout controls and project information', () => {
  const path = '../src/components/profile/ProfileCategoryPage.tsx';
  const source = read(path);
  assert.equal(attributes(path, 'data-shared-page-count').result.length, 0);
  assert.ok(!source.includes('activePageLabel'));
  assert.match(source, /Pages\/row \{pageLayoutDraft\}/);
  assert.match(source, /<label className="[^"]*relative[^"]*h-full[^"]*items-center[^"]*"[^>]*>[\s\S]*data-pages-per-row-slider=""/);
  assert.match(source, /data-pages-per-row-slider=""[\s\S]*data-pages-per-row-label=""/);
  assert.match(source, /data-pages-per-row-label="" className="[^"]*absolute[^"]*top-\[calc\(50%\+11px\)\][^"]*text-\[8px\][^"]*text-\[var\(--text-secondary\)\]/);
  assert.match(source, /aria-label="Pages per row"/);
  assert.match(source, /min=\{MIN_PAGES_PER_ROW\}/);
  assert.match(source, /max=\{MAX_PAGES_PER_ROW\}/);
  assert.match(source, /pageCount=\{activePageCount\}/);
  const viewer = read('../src/components/media/ProjectMediaViewer.tsx');
  assert.match(viewer, />Pages<\/dt><dd[^>]*>\{pageCount\}/);
  assert.equal(Object.keys(declarations(`${scope} [data-shared-page-count]`)).length, 0);
});

test('public sidebar aligns with the workspace inset and details header stays anchored during scrolling', () => {
  const sidebar = declarations('.codex-shell > aside.sidebar-starfield.shared-profile-sidebar');
  assert.equal(sidebar['padding-top'], 'calc(var(--codex-workspace-inset) + var(--codex-workspace-border-width))');
  const details = declarations(`${scope} [data-project-response-rail] > [data-shared-navigation-header]`);
  assert.equal(details.position, 'sticky');
  assert.equal(details.top, '0');
  assert.equal(details['z-index'], '10');
});

test('shared projects omit density callbacks and gesture hints while keeping document reading callbacks', () => {
  const path = '../src/components/profile/ProfileCategoryPage.tsx';
  const change = attributes(path, 'onPagesPerRowChange');
  const densityExpression = change.result[0].expression.getText(change.file);
  const update = () => {};
  assert.equal(vm.runInNewContext(densityExpression, { sharedReadOnly: true, setPageLayoutDraft: update }), undefined);
  assert.equal(vm.runInNewContext(densityExpression, { sharedReadOnly: false, setPageLayoutDraft: update }), update);
  assert.equal(attributes(path, 'onPageFocusModeChange').result.length, 1);
  assert.equal(attributes(path, 'pageViewToggleRequest').result.length, 1);

  let hint;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(change.file) === 'MobileProjectGestureHint') {
      let parent = node.parent;
      while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
      hint = parent.expression.getText(change.file);
    }
    ts.forEachChild(node, visit);
  }
  visit(change.file);
  assert.ok(hint);
  const script = ts.transpileModule(`result = (${hint});`, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  const context = { React, MobileProjectGestureHint: 'gesture-hint', mobileProjectView: true, isIndexCollapsed: true, isPageFocused: false, activeAttachments: [{ kind: 'document' }] };
  for (const sharedReadOnly of [false, true]) {
    const result = { ...context, sharedReadOnly };
    vm.runInNewContext(script, result);
    assert.equal(Boolean(result.result), !sharedReadOnly);
  }
});
