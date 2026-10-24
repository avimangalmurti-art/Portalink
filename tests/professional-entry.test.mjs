import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const words = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(words).join('') : tree == null ? '' : String(tree);
function fixture(ready = true) {
  let story = false;
  const calls = [];
  const { ProfessionalEntry } = sourceModule('src/components/auth/ProfessionalEntry.tsx', {
    react: { ...React, useState: () => [story, value => { story = typeof value === 'function' ? value(story) : value; }] },
    'lucide-react': { ArrowRight: 'arrow' },
    '../../data/sourceImages': sourceModule('src/data/sourceImages.ts'),
    './CatalogWelcome': { CatalogWelcome: 'optional-story' }, './professional-entry.css': {},
  });
  return { calls, render: () => ProfessionalEntry({ ready, onCreate: () => calls.push('create'), onSignIn: () => calls.push('signin'), onGuest: () => calls.push('guest') }) };
}
test('professional entry immediately exposes create, sign-in and guest actions without a film or timer', () => {
  const h = fixture(), tree = h.render(), all = nodes(tree);
  assert.equal(tree.type, 'main');
  assert.equal(all.find(n => n.type === 'h1').props.id, tree.props['aria-labelledby']);
  assert.equal(all.some(n => n.type === 'optional-story'), false);
  for (const [label, action] of [['Create catalogue', 'create'], ['Sign in ', 'signin'], ['Continue as guest ', 'guest']]) {
    const button = all.find(n => n.type === 'button' && words(n).trim() === label.trim());
    assert.ok(button, label); assert.equal(button.props.disabled, false); button.props.onClick(); assert.equal(h.calls.at(-1), action);
    if (action === 'create') assert.equal(button.props['data-ui-shape'], 'action', 'Use the shared action radius instead of the mobile fallback');
  }
  const images = all.filter(n => n.type === 'img');
  assert.equal(images.length, 6); assert.equal(new Set(images.map(n => n.props.src)).size, 6);
  assert.ok(images.every(n => n.props.src.startsWith('/') && n.props.alt));
});
test('the brand film opens only on request and Back restores immediate choices without an auth action', () => {
  const h = fixture(); nodes(h.render()).find(n => n.type === 'button' && words(n) === 'About Portalink').props.onClick();
  let story = h.render(); assert.equal(story.type, 'optional-story'); assert.deepEqual(h.calls, []);
  story.props.onDismiss(); assert.equal(h.render().type, 'main'); assert.deepEqual(h.calls, []);
  nodes(h.render()).find(n => n.type === 'button' && words(n) === 'About Portalink').props.onClick();
  story = h.render(); story.props.onStart(); assert.deepEqual(h.calls, ['create']);
  assert.equal(h.render().type, 'main', 'The body-portalled story must unmount before the parent opens authentication');
});
test('entry controls follow readiness without enabling account actions before restoration completes', () => {
  const h = fixture(false); assert.ok(nodes(h.render()).filter(n => n.type === 'button').every(n => n.props.disabled));
  assert.deepEqual(h.calls, []);
});
