import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const words = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(words).join('') : tree == null ? '' : String(tree);
function fixture(ready = true, presentation = 'web', settings = {}) {
  const calls = [], appearanceCalls = [];
  const appearance = { mode: 'auto', theme: 'light', accentColor: '#0A84FF', systemGray: 'gray6', highContrast: false, reduceTranslucency: false, ...settings,
    chooseMode(mode) { appearanceCalls.push({ mode }); appearance.mode = mode; appearance.theme = mode === 'auto' ? 'light' : mode; },
    chooseAppearance(patch) { appearanceCalls.push(patch); Object.assign(appearance, patch); } };
  const { ProfessionalEntry } = sourceModule('src/components/auth/ProfessionalEntry.tsx', {
    react: { ...React, useRef: () => ({ current: null }) },
    'lucide-react': { ArrowRight: 'arrow', BriefcaseBusiness: 'briefcase', ChevronRight: 'chevron', Compass: 'compass', Info: 'info', LayoutGrid: 'grid', LogIn: 'login', Palette: 'palette', PanelsTopLeft: 'panels', Route: 'route', ShieldCheck: 'shield', SunMoon: 'sun-moon', UserPlus: 'user-plus', UserRound: 'user-round', Users: 'users' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../profile/ProfileAvatar': { ProfileAvatar: 'profile-avatar' },
    '../../hooks/useDeviceAppearance': { useDeviceAppearance: () => appearance },
    '../../data/navButtonTokens': sourceModule('src/data/navButtonTokens.ts'),
    '../../utils/accentTokens': sourceModule('src/utils/accentTokens.ts'),
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown: () => undefined },
    './MobileOnboarding': { MobileOnboardingAppearance: 'appearance-controls' },
    './professional-entry.css': {},
  });
  return { calls, appearanceCalls, appearance, render: () => ProfessionalEntry({ ready, onCreate: () => calls.push('create'), onSignIn: () => calls.push('signin'), onGuest: () => calls.push('guest') }) };
}
test('professional entry immediately exposes create, sign-in and guest actions without a film or timer', () => {
  const h = fixture(), tree = h.render(), all = nodes(tree);
  assert.equal(tree.type, 'main');
  assert.equal(all.find(n => n.type === 'h1').props.id, tree.props['aria-labelledby']);
  assert.equal(all.some(n => n.type === 'optional-story'), false);
  for (const [label, action] of [['Create account', 'create'], ['Sign in ', 'signin'], ['Continue as guest ', 'guest']]) {
    const button = all.find(n => n.type === 'button' && words(n).trim() === label.trim());
    assert.ok(button, label); assert.equal(button.props.disabled, false); button.props.onClick(); assert.equal(h.calls.at(-1), action);
  }
});
test('the landing page has no story action, overlay or character artwork in either presentation', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    assert.equal(words(tree).includes('Watch our story'), false);
    assert.equal(all.some(n => n.type === 'optional-story'), false);
    assert.equal(tree.props['aria-hidden'], undefined);
    assert.equal(tree.props.style === undefined, presentation === 'web');
    assert.ok(all.filter(n => n.type === 'img').every(n => !n.props.src.includes('/onboarding/')));
    assert.deepEqual(h.calls, []);
  }
});

test('both presentations expose nine native company disclosures with distinct icons and the original account actions', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    const brand = all.find(n => n.props.className === 'professional-entry-wordmark');
    assert.equal(words(all.find(n => n.props.className === 'professional-entry-company-name')), 'Portalink Networks Inc.');
    if (presentation === 'mobile') {
      const avatar = nodes(brand).find(n => n.type === 'profile-avatar');
      assert.equal(avatar.props.avatar, '/icons/portalink-app-512-62b9d2e7.png');
      assert.match(avatar.props.videoSrc, /^\/company\/avatar-loop-[a-f0-9]{12}\.mp4$/);
      assert.equal(avatar.props.name, 'Portalink Networks Inc.');
      assert.equal(avatar.props.inlinePreview, true);
      assert.equal(avatar.props.previewHost, tree.ref, 'The viewer mounts at the unfiltered welcome root');
      assert.equal(tree.props['data-profile-avatar-host'], '');
      assert.equal(words(tree).includes('Create, organize and share your work.'), false);
    } else {
      const logo = nodes(brand).find(n => n.type === 'img');
      assert.equal(logo.props.src, '/icons/portalink-app-192-62b9d2e7.png');
      assert.ok(logo.props.className.includes('squircle'));
      assert.equal(logo.props.alt, '');
    }
    const sections = all.filter(n => n.type === 'details' && n.props['data-company-section']);
    assert.equal(sections.length, 9);
    const features = sections.find(n => n.props['data-company-section'] === 'features');
    assert.equal(nodes(features).some(n => ['figure', 'img', 'picture', 'video'].includes(n.type)), false, 'Features stays text-only until images are explicitly requested');
    assert.match(words(features), /Bring images, documents and video into your projects\./);
    assert.ok(sections.every(n => n.props.open === undefined), 'Company sections start collapsed without hiding their native keyboard controls');
    assert.deepEqual(sections.flatMap(nodes).filter(n => n.type === 'summary').map(words), ['About Portalink', 'Mission', 'Features', 'How it works', 'Portals', 'For creators', 'Team', 'Careers', 'Privacy & control']);
    const icons = sections.flatMap(nodes).filter(n => n.props.className === 'professional-entry-company-icon');
    assert.equal(icons.length, 9);
    assert.equal(new Set(icons.map(n => n.props.children.type)).size, 9);
    assert.ok(icons.every(n => n.props['aria-hidden'] === 'true'), 'Decorative icons do not repeat the section names');
    assert.equal(all.some(n => n.type === 'header'), false, 'The redundant Portalink heading and header sign-in row are removed');
    assert.equal(words(tree).includes('Create catalogue'), false);
    assert.equal(nodes(all.find(n => n.props.className === 'professional-entry-company-card')).some(n => n.props.className === 'professional-entry-create' || n.props.className === 'professional-entry-signin'), false, 'Account actions are separate from the company identity card');
    const accountActions = nodes(all.find(n => n.props.className === 'professional-entry-account-actions')).filter(n => n.type === 'button');
    assert.deepEqual(accountActions.map(button => words(button).trim()), presentation === 'mobile' ? ['Create account', 'Sign in', 'Continue as guest'] : ['Create account', 'Sign in']);
    assert.equal(all.filter(n => n.type === 'button' && words(n).trim() === 'Continue as guest').length, 1);
    for (const label of ['Create account', 'Sign in', 'Continue as guest']) {
      all.find(n => n.type === 'button' && words(n).trim() === label).props.onClick();
    }
    assert.deepEqual(h.calls, ['create', 'signin', 'guest']);
  }
});

test('mobile home appearance controls share the persisted settings callbacks and keep WEB unchanged', () => {
  const h = fixture(true, 'mobile'), first = h.render();
  assert.equal(first.props['data-entry-theme'], 'light');
  const modes = nodes(first).find(n => n.props.role === 'radiogroup' && n.props['aria-label'] === 'Appearance');
  assert.ok(modes);
  nodes(modes).find(n => words(n) === 'Dark' && n.type === 'button').props.onClick();
  let tree = h.render();
  assert.equal(tree.props['data-entry-theme'], 'dark');
  const controls = nodes(tree).find(n => n.type === 'appearance-controls');
  assert.equal(controls.props.idPrefix, 'entry', 'Home controls cannot share signup field IDs');
  assert.equal(controls.props.showPreview, false, 'The actual home surface is the preview');
  controls.props.onAccentColorChange('#A550D8');
  controls.props.onHighContrastChange(true);
  controls.props.onReduceTranslucencyChange(true);
  controls.props.onSystemGrayChange('gray4');
  tree = h.render();
  assert.equal(tree.props['data-entry-contrast'], true);
  assert.equal(tree.props['data-entry-solid'], true);
  assert.equal(tree.props.style['--accent-primary'], '#BF5AF2', 'Accent resolves for the selected dark theme');
  assert.equal(tree.props.style['--navigation-blur'], 'none');
  assert.equal(tree.props.style['--navigation-surface'], '#3A3A3C');
  assert.equal(nodes(tree).some(n => n.props.role === 'status' && words(n) === 'High contrast keeps controls opaque.'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.appearanceCalls)), [{ mode: 'dark' }, { accentColor: '#A550D8' }, { highContrast: true }, { reduceTranslucency: true }, { systemGray: 'gray4' }]);
  assert.deepEqual(h.calls, []);
  const web = fixture(true, 'web', h.appearance).render();
  assert.equal(web.props.style, undefined);
  assert.equal(web.props['data-entry-theme'], undefined);
  assert.equal(nodes(web).some(n => n.props['data-entry-appearance'] !== undefined), false);
});

test('mobile Appearance precedes company information without changing the WEB section order', () => {
  const mobile = nodes(fixture(true, 'mobile').render());
  assert.deepEqual(mobile.filter(n => n.type === 'summary').map(words), ['Appearance', 'About Portalink', 'Mission', 'Features', 'How it works', 'Portals', 'For creators', 'Team', 'Careers', 'Privacy & control']);
  const web = nodes(fixture().render());
  assert.equal(web.find(n => n.type === 'summary').props.children[1].props.children, 'About Portalink');
  assert.equal(web.some(n => n.props['data-entry-appearance'] !== undefined), false);
});
test('entry controls follow readiness without enabling account actions before restoration completes', () => {
  const h = fixture(false); assert.ok(nodes(h.render()).filter(n => n.type === 'button').every(n => n.props.disabled));
  assert.equal(nodes(h.render()).filter(n => n.type === 'summary').length, 9, 'Company information remains available while account restoration is pending');
  assert.deepEqual(h.calls, []);
});
