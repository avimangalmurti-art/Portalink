import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const words = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(words).join('') : tree == null ? '' : String(tree);
function fixture(ready = true, presentation = 'web') {
  let story = false;
  const calls = [];
  const { ProfessionalEntry } = sourceModule('src/components/auth/ProfessionalEntry.tsx', {
    react: { ...React, useState: () => [story, value => { story = typeof value === 'function' ? value(story) : value; }] },
    'lucide-react': { ArrowRight: 'arrow', Check: 'check', ChevronDown: 'chevron' },
    '../../data/sourceImages': sourceModule('src/data/sourceImages.ts'),
    '../../presentation/usePresentation': { usePresentation: () => presentation },
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
  const images = nodes(all.find(n => n.type === 'figure')).filter(n => n.type === 'img');
  assert.equal(images.length, 6); assert.equal(new Set(images.map(n => n.props.src)).size, 6);
  assert.ok(images.every(n => n.props.src.startsWith('/') && n.props.alt));
});
test('the brand film opens only on request and Back restores immediate choices without an auth action', () => {
  const h = fixture(); nodes(h.render()).find(n => n.type === 'button' && words(n) === 'Watch our story').props.onClick();
  let tree = h.render(), story = nodes(tree).find(n => n.type === 'optional-story');
  assert.ok(story); assert.deepEqual(h.calls, []);
  assert.equal(tree.props.style.visibility, 'hidden');
  assert.equal(nodes(tree).filter(n => n.type === 'details').length, 9, 'Company DOM stays mounted to preserve open sections and scroll');
  story.props.onDismiss(); assert.equal(h.render().props.style, undefined); assert.deepEqual(h.calls, []);
  nodes(h.render()).find(n => n.type === 'button' && words(n) === 'Watch our story').props.onClick();
  story = nodes(h.render()).find(n => n.type === 'optional-story'); story.props.onStart(); assert.deepEqual(h.calls, ['create']);
  assert.equal(nodes(h.render()).some(n => n.type === 'optional-story'), false, 'The body-portalled story must unmount before the parent opens authentication');
});

test('both presentations expose nine native company disclosures, characters and the original account actions', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    const sections = all.filter(n => n.type === 'details');
    assert.equal(sections.length, 9);
    assert.ok(sections.every(n => n.props.open === undefined), 'Company sections start collapsed without hiding their native keyboard controls');
    assert.deepEqual(all.filter(n => n.type === 'summary').map(words), ['About Portalink', 'Mission', 'Features', 'How it works', 'Portals', 'For creators', 'Team', 'Careers', 'Privacy & control']);
    const characters = all.filter(n => n.props.className === 'professional-entry-company-character');
    assert.equal(characters.length, 9);
    assert.equal(new Set(characters.map(n => n.props.src)).size, 3);
    assert.ok(characters.every(n => n.props.alt === '' && n.props['aria-hidden'] === 'true'), 'Decorative characters do not repeat the section names');
    const actions = all.filter(n => n.type === 'button' && words(n).trim() === 'Create catalogue');
    assert.equal(actions.length, 1);
    if (presentation === 'mobile') assert.ok(all.indexOf(actions[0]) > all.indexOf(sections.at(-1)), 'The mobile primary action follows the nine sections');
    for (const label of ['Create catalogue', 'Sign in', 'Continue as guest']) {
      all.find(n => n.type === 'button' && words(n).trim() === label).props.onClick();
    }
    assert.deepEqual(h.calls, ['create', 'signin', 'guest']);
  }
});
test('entry controls follow readiness without enabling account actions before restoration completes', () => {
  const h = fixture(false); assert.ok(nodes(h.render()).filter(n => n.type === 'button').every(n => n.props.disabled));
  assert.equal(nodes(h.render()).filter(n => n.type === 'summary').length, 9, 'Company information remains available while account restoration is pending');
  assert.deepEqual(h.calls, []);
});
