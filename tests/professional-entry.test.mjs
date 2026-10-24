import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const words = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(words).join('') : tree == null ? '' : String(tree);
function fixture(ready = true, presentation = 'web') {
  const calls = [];
  const { ProfessionalEntry } = sourceModule('src/components/auth/ProfessionalEntry.tsx', {
    react: React,
    'lucide-react': { ArrowRight: 'arrow', BriefcaseBusiness: 'briefcase', ChevronRight: 'chevron', Compass: 'compass', Info: 'info', LayoutGrid: 'grid', Palette: 'palette', PanelsTopLeft: 'panels', Route: 'route', ShieldCheck: 'shield', Users: 'users' },
    '../../data/sourceImages': sourceModule('src/data/sourceImages.ts'),
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    './professional-entry.css': {},
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
  }
  const images = nodes(all.find(n => n.type === 'figure')).filter(n => n.type === 'img');
  assert.equal(images.length, 6); assert.equal(new Set(images.map(n => n.props.src)).size, 6);
  assert.ok(images.every(n => n.props.src.startsWith('/') && n.props.alt));
});
test('the landing page has no story action, overlay or character artwork in either presentation', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    assert.equal(words(tree).includes('Watch our story'), false);
    assert.equal(all.some(n => n.type === 'optional-story'), false);
    assert.equal(tree.props['aria-hidden'], undefined);
    assert.equal(tree.props.style, undefined);
    assert.ok(all.filter(n => n.type === 'img').every(n => !n.props.src.includes('/onboarding/')));
    assert.deepEqual(h.calls, []);
  }
});

test('both presentations expose nine native company disclosures with distinct icons and the original account actions', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    const brand = all.find(n => n.props.className === 'professional-entry-wordmark');
    assert.equal(words(all.find(n => n.props.className === 'professional-entry-company-name')), 'Portalink Networks Inc.');
    const logo = nodes(brand).find(n => n.type === 'img');
    assert.equal(logo.props.src, '/icons/portalink-app-192-62b9d2e7.png');
    assert.ok(logo.props.className.includes('squircle'));
    assert.equal(logo.props.alt, '');
    const sections = all.filter(n => n.type === 'details');
    assert.equal(sections.length, 9);
    assert.ok(sections.every(n => n.props.open === undefined), 'Company sections start collapsed without hiding their native keyboard controls');
    assert.deepEqual(all.filter(n => n.type === 'summary').map(words), ['About Portalink', 'Mission', 'Features', 'How it works', 'Portals', 'For creators', 'Team', 'Careers', 'Privacy & control']);
    const icons = sections.flatMap(nodes).filter(n => n.props.className === 'professional-entry-company-icon');
    assert.equal(icons.length, 9);
    assert.equal(new Set(icons.map(n => n.props.children.type)).size, 9);
    assert.ok(icons.every(n => n.props['aria-hidden'] === 'true'), 'Decorative icons do not repeat the section names');
    const actions = all.filter(n => n.type === 'button' && words(n).trim() === 'Create catalogue');
    assert.equal(actions.length, 1);
    assert.ok(nodes(all.find(n => n.props.className === 'professional-entry-company-card')).some(n => n.type === 'button' && words(n).trim() === 'Create catalogue'), 'The company card contains the primary account action');
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
