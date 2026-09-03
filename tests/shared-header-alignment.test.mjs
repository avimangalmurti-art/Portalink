import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import postcss from 'postcss';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = postcss.parse(read('../src/index.css'));
const scope = '.codex-shell.shared-portalink-shell';
function declarations(selector) {
  const result = {};
  css.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, ' ').trim() !== selector) return;
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
  assert.equal(tokens['--shared-header-control'], '40px');
  assert.equal(tokens['--shared-header-glyph'], '18px');
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
  // Every 40px control has 12px above/below it in the 64px header, regardless
  // of the rail's horizontal width or theme. This is a source-level contract,
  // not a substitute for claiming browser pixel measurements.
  assert.equal((parseInt(tokens['--shared-header-height']) - parseInt(tokens['--shared-header-control'])) / 2, 12);
});

test('text glyph and page count share the header centerline without losing Plex Mono', () => {
  const source = read('../src/components/media/ProjectMediaViewer.tsx');
  assert.match(source, /data-shared-info-glyph=""[^\n]+IBM Plex Mono/);
  const glyph = declarations(`${scope} [data-shared-navigation-header] [data-shared-info-glyph]`);
  assert.equal(glyph['font-size'], '12px');
  assert.equal(glyph['line-height'], '1');
  const count = declarations(`${scope} [data-shared-page-count]`);
  assert.equal(count.height, 'var(--shared-header-control)');
  assert.equal(count['line-height'], count.height);
  assert.equal(attributes('../src/components/profile/ProfileCategoryPage.tsx', 'data-shared-page-count').result.length, 1);
});

test('public sidebar has no stray top inset and details header stays anchored during scrolling', () => {
  const sidebar = declarations(`${scope} > aside.sidebar-starfield.shared-profile-sidebar`);
  assert.equal(sidebar['padding-top'], '0');
  const details = declarations(`${scope} [data-project-response-rail] > [data-shared-navigation-header]`);
  assert.equal(details.position, 'sticky');
  assert.equal(details.top, '0');
  assert.equal(details['z-index'], '10');
});
