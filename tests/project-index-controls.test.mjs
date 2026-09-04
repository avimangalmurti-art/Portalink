import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadControls() {
  const source = readFileSync(new URL('../src/features/projects/projectIndexControls.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => ({}) });
  return exports;
}

const { applyProjectIndexControls, projectIndexCountLabel } = loadControls();
const projects = [
  { id: 'beta', title: 'Beta 10', summary: 'Visible older', publishedAt: '2026-01-01T00:00:00Z' },
  { id: 'alpha', title: 'alpha 2', summary: 'Visible newer', publishedAt: '2026-02-01T00:00:00Z' },
  { id: 'legacy', title: 'Legacy', summary: 'Hidden without a date' },
];
const controls = { sort: 'custom', filter: 'all', query: '', hiddenIds: ['legacy'], savedIds: ['alpha'] };
const ids = (next) => Array.from(next, (project) => project.id);

test('project index filters use real visibility and viewer save membership', () => {
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, filter: 'visible' })), ['beta', 'alpha']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, filter: 'hidden' })), ['legacy']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, filter: 'saved' })), ['alpha']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, query: 'newer' })), ['alpha']);
});

test('project sorting preserves custom order and handles legacy dates deterministically', () => {
  assert.deepEqual(ids(applyProjectIndexControls(projects, controls)), ['beta', 'alpha', 'legacy']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, sort: 'newest' })), ['alpha', 'beta', 'legacy']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, sort: 'oldest' })), ['beta', 'alpha', 'legacy']);
  assert.deepEqual(ids(applyProjectIndexControls(projects, { ...controls, sort: 'alphabetical' })), ['alpha', 'beta', 'legacy']);
  assert.deepEqual(ids(applyProjectIndexControls([...projects].reverse(), { ...controls, sort: 'newest' })), ['alpha', 'beta', 'legacy']);
});

test('project count distinguishes a complete index from a filtered result', () => {
  assert.equal(projectIndexCountLabel(1, 1), '1 project');
  assert.equal(projectIndexCountLabel(7, 7), '7 projects');
  assert.equal(projectIndexCountLabel(7, 2), '2 of 7 projects');
});

test('the category offers role-aware controls and disables dragging outside the complete custom list', () => {
  const page = readFileSync(new URL('../src/components/profile/ProfileCategoryPage.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../src/components/profile/ProjectIndexList.tsx', import.meta.url), 'utf8');
  const saves = readFileSync(new URL('../src/features/projects/useSavedProjectIds.ts', import.meta.url), 'utf8');
  assert.match(page, /aria-label="Sort projects"/);
  assert.match(page, /<option value="saved">Saved only<\/option>/);
  assert.match(page, /<option value="visible">Visible<\/option>/);
  assert.match(page, /<option value="hidden">Hidden<\/option>/);
  assert.match(page, /canReorder=\{showsOwnerTools && projectSort === 'custom' && effectiveFilter === 'all' && !query\.trim\(\)\}/);
  assert.match(list, /rest\.length > 0 && canReorder \? <Reorder\.Group/);
  assert.match(saves, /const accountId = useAuth\(\)\.user\?\.id \?\? null/);
  assert.match(saves, /\[accountId, active, engagement, revision\]/, 'saved membership reloads when the signed-in account changes');
});
