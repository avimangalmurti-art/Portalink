import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { sourceModule } from './helpers/source-module.mjs';
const { ProjectFeedCard } = sourceModule('src/components/home/ProjectFeedCard.tsx', {
  react: React, '../profile/ProjectPreviewCard': { ProjectPreviewCard: 'preview' },
});
test('Home own-project popup actions invoke the existing editor modes and deletion confirmation', () => {
  const calls = [];
  const management = { editor: { open: (...args) => calls.push(['edit', ...args]) }, deletion: { request: id => calls.push(['delete', id]) } };
  const view = { project: { id: 'project', categoryId: 'portal', title: 'Work' }, creator: { id: 'owner', name: 'Creator' } };
  const card = ProjectFeedCard({ view, management, onOpenProject() {}, onOpenCreator() {} });
  card.props.contextHandlers.edit();
  card.props.onEditDescription();
  card.props.contextHandlers.cover();
  card.props.contextHandlers.delete();
  assert.deepEqual(calls, [['edit', 'project'], ['edit', 'project', 'description'], ['edit', 'project', 'cover'], ['delete', 'project']]);
  const other = ProjectFeedCard({ view, onOpenProject() {}, onOpenCreator() {} });
  assert.equal(other.props.contextHandlers, undefined);
  assert.equal(other.props.onEditDescription, undefined);
});
test('Home supplies management only to authenticated owner cards', () => {
  const source = readFileSync(new URL('../src/components/home/HomeFeed.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('HomeFeed.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'ProjectFeedCard') {
      expression = node.attributes.properties.find(prop => prop.name?.getText(file) === 'management').initializer.expression.getText(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const [isAuthenticated, viewerProfileId, creatorId, expected] of [[true,'owner','owner',true],[true,'owner','other',false],[false,'owner','owner',false],[false,null,'other',false]]) {
    assert.equal(vm.runInNewContext(expression, { isAuthenticated, viewerProfileId, view: { creator: { id: creatorId } }, management: 'owner-management' }), expected ? 'owner-management' : undefined);
  }
});
