import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { sortPortalProjects } = sourceModule('src/components/profile/portalProjectBrowsing.ts');
const ids = projects => Array.from(projects, project => project.id);
const projects = Object.freeze([
  Object.freeze({ id: 'zebra', title: 'Zebra', publishedAt: '2026-01-02T00:00:00Z' }),
  Object.freeze({ id: 'apple', title: 'Apple', publishedAt: '2026-01-04T00:00:00Z' }),
  Object.freeze({ id: 'beta', title: 'Beta', publishedAt: 'not-a-date' }),
  Object.freeze({ id: 'delta', title: 'Delta' }),
]);

test('Recent orders valid publication dates newest first and keeps unavailable dates stable', () => {
  const result = sortPortalProjects(projects, 'recent');
  assert.deepEqual(ids(result), ['apple', 'zebra', 'beta', 'delta']);
  assert.equal(result[0], projects[1], 'Browsing retains each canonical record.');
  assert.deepEqual(ids(projects), ['zebra', 'apple', 'beta', 'delta']);
});

test('Name orders the same records without mutating the saved arrangement', () => {
  assert.deepEqual(ids(sortPortalProjects(projects, 'title')), ['apple', 'beta', 'delta', 'zebra']);
  assert.deepEqual(ids(projects), ['zebra', 'apple', 'beta', 'delta']);
});

test('Saved order returns a new array in canonical order after another view was sorted', () => {
  sortPortalProjects(projects, 'title');
  const saved = sortPortalProjects(projects, 'saved');
  assert.notEqual(saved, projects);
  assert.deepEqual(ids(saved), ids(projects));
  assert.ok(saved.every((project, index) => project === projects[index]));
  assert.deepEqual(ids(sortPortalProjects([], 'recent')), []);
});
