import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const words = tree => React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(words).join('') : tree == null ? '' : String(tree);
function fixture(ready = true, presentation = 'web', settings = {}) {
  const calls = [], appearanceCalls = [], presentationCalls = [];
  const appearance = { mode: 'auto', theme: 'light', accentColor: '#0A84FF', systemGray: 'gray6', highContrast: false, reduceTranslucency: false, ...settings,
    chooseMode(mode) { appearanceCalls.push({ mode }); appearance.mode = mode; appearance.theme = mode === 'auto' ? 'light' : mode; },
    chooseAppearance(patch) { appearanceCalls.push(patch); Object.assign(appearance, patch); } };
  const { ProfessionalEntry } = sourceModule('src/components/auth/ProfessionalEntry.tsx', {
    react: { ...React, useRef: () => ({ current: null }) },
    'lucide-react': { ArrowRight: 'arrow', BriefcaseBusiness: 'briefcase', ChevronRight: 'chevron', Compass: 'compass', DoorOpen: 'door-open', Info: 'info', LayoutGrid: 'grid', LogIn: 'login', Palette: 'palette', Route: 'route', ShieldCheck: 'shield', SunMoon: 'sun-moon', UserPlus: 'user-plus', UserRound: 'user-round', Users: 'users' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../profile/ProfileAvatar': { ProfileAvatar: 'profile-avatar' },
    '../../hooks/useDeviceAppearance': { useDeviceAppearance: mode => { presentationCalls.push(mode); return appearance; } },
    '../../data/navButtonTokens': sourceModule('src/data/navButtonTokens.ts'),
    '../../utils/accentTokens': sourceModule('src/utils/accentTokens.ts'),
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown: () => undefined },
    './MobileOnboarding': { MobileOnboardingAppearance: 'appearance-controls' },
    './CityClock': { CityClock: 'city-clock' },
    './professional-entry.css': {},
  });
  return { calls, appearanceCalls, presentationCalls, appearance, render: (embedded = false) => ProfessionalEntry({ ready, embedded, onCreate: () => calls.push('create'), onSignIn: () => calls.push('signin') }) };
}
test('embedded company entry keeps a single outer main landmark and page heading', () => {
  for (const presentation of ['mobile', 'web']) {
    const tree = fixture(true, presentation).render(true), all = nodes(tree);
    assert.equal(tree.type, 'section');
    assert.equal(all.some(node => node.type === 'main' || node.type === 'h1'), false);
    assert.equal(all.find(node => node.type === 'h2').props.id, tree.props['aria-labelledby']);
  }
});
test('both entry presentations expose only Create account and Sign in immediately alongside the live city clock', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    assert.equal(tree.type, 'main');
    assert.equal(all.find(n => n.type === 'h1').props.id, tree.props['aria-labelledby']);
    assert.equal(all.filter(n => n.type === 'city-clock').length, 1);
    const accountGroup = all.find(n => n.props.className === 'professional-entry-account-actions');
    assert.equal(accountGroup.props.role, 'group');
    assert.equal(accountGroup.props['aria-label'], 'Account options');
    const buttons = nodes(accountGroup).filter(n => n.type === 'button');
    assert.deepEqual(buttons.map(words), ['Create account', 'Sign in']);
    assert.equal(/guest/i.test(words(tree)), false, 'The entry does not offer guest access anywhere in its content');
    assert.equal(all.some(n => n.props.className === 'professional-entry-guest' || 'onGuest' in n.props), false);
    for (const [index, action] of ['create', 'signin'].entries()) {
      const button = buttons[index];
      assert.equal(button.props.disabled, false);
      assert.ok(nodes(button).some(n => n.props.className === 'professional-entry-company-icon'));
      assert.ok(nodes(button).some(n => n.props.className === 'professional-entry-company-chevron'));
      button.props.onClick();
      assert.equal(h.calls.at(-1), action);
    }
    assert.deepEqual(h.presentationCalls, [presentation], 'Device appearance retains the actual presentation context');
  }
});
test('the landing page has no story action, overlay or character artwork in either presentation', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    assert.equal(words(tree).includes('Watch our story'), false);
    assert.equal(all.some(n => n.type === 'optional-story'), false);
    assert.equal(tree.props['aria-hidden'], undefined);
    assert.equal(typeof tree.props.style, 'object');
    assert.equal(tree.props['data-entry-theme'], 'light');
    assert.equal(all.some(n => n.type === 'footer'), false);
    assert.equal(all.some(n => n.props.className === 'professional-entry-eyebrow'), false);
    assert.ok(all.filter(n => n.type === 'img').every(n => !n.props.src.includes('/onboarding/')));
    assert.deepEqual(h.calls, []);
  }
});

test('both presentations expose nine native company disclosures with distinct icons and the original account actions', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(true, presentation), tree = h.render(), all = nodes(tree);
    const brand = all.find(n => n.props.className === 'professional-entry-wordmark');
    assert.equal(words(all.find(n => n.props.className === 'professional-entry-company-name')), 'Portalink Networks Inc.');
    assert.equal(nodes(brand).filter(n => n.type === 'city-clock').length, 1, 'Both presentations place the same live clock beneath the company name');
    assert.equal(nodes(brand).filter(n => n.type === 'creative-thought').length, 0);
    const avatar = nodes(brand).find(n => n.type === 'profile-avatar');
    assert.equal(avatar.props.avatar, '/icons/portalink-app-512-62b9d2e7.png');
    assert.equal(avatar.props.videoSrc, '/company/avatar-loop-098c2e5d5e1e.mp4');
    assert.equal(avatar.props.name, 'Portalink Networks Inc.');
    assert.equal(avatar.props.inlinePreview, true);
    assert.equal(avatar.props.previewHost, tree.ref, 'The viewer mounts at the unfiltered welcome root');
    assert.equal(tree.props['data-profile-avatar-host'], '');
    assert.equal(words(tree).includes('Create, organize and share your work.'), false);
    assert.equal(nodes(brand).some(n => n.type === 'img'), false, 'The company uses its video avatar on both presentations');
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
    assert.deepEqual(accountActions.map(button => words(button).trim()), ['Create account', 'Sign in']);
    assert.equal(all.filter(n => n.type === 'button' && /guest/i.test(words(n))).length, 0);
    for (const label of ['Create account', 'Sign in']) {
      all.find(n => n.type === 'button' && words(n).trim() === label).props.onClick();
    }
    assert.deepEqual(h.calls, ['create', 'signin']);
  }
});

test('both entry presentations apply appearance tokens through the same persisted settings callbacks', () => {
 for (const presentation of ['mobile', 'web']) {
  const h = fixture(true, presentation), first = h.render();
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
  assert.ok(h.presentationCalls.every(mode => mode === presentation));
 }
});

test('both presentations group Appearance with account actions and retain the same six-plus-three company sections', () => {
  for (const presentation of ['mobile', 'web']) {
    const all = nodes(fixture(true, presentation).render());
    assert.deepEqual(all.filter(n => n.type === 'summary').map(words), ['Appearance', 'About Portalink', 'Mission', 'Features', 'How it works', 'Portals', 'For creators', 'Team', 'Careers', 'Privacy & control']);
    const settings = all.find(n => n.props.className === 'professional-entry-account-settings');
    assert.equal(settings.props['aria-label'], 'Account and appearance options');
    assert.equal(nodes(settings).filter(n => n.props['data-entry-appearance'] !== undefined).length, 1);
    assert.equal(nodes(settings).filter(n => n.props.className === 'professional-entry-account-actions').length, 1);
    const groups = all.filter(n => n.props.className?.split(' ').includes('professional-entry-company-group'));
    assert.deepEqual(groups.map(group => nodes(group).filter(n => n.type === 'details').map(n => n.props['data-company-section'])), [
      ['about', 'mission', 'features', 'how-it-works', 'portals', 'creators'], ['team', 'careers', 'privacy'],
    ]);
  }
});
test('entry controls follow readiness without enabling account actions before restoration completes', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(false, presentation), all = nodes(h.render());
    const accountGroup = all.find(n => n.props.className === 'professional-entry-account-actions');
    const accountButtons = nodes(accountGroup).filter(n => n.type === 'button');
    assert.deepEqual(accountButtons.map(words), ['Create account', 'Sign in']);
    assert.ok(accountButtons.every(n => n.props.disabled === true));
    assert.equal(all.filter(n => n.type === 'summary').length, 10, 'Appearance and company information remain available while account restoration is pending');
    const modes = all.find(n => n.props.role === 'radiogroup' && n.props['aria-label'] === 'Appearance');
    assert.ok(nodes(modes).filter(n => n.type === 'button').every(n => !n.props.disabled));
    assert.deepEqual(h.calls, []);
  }
});

test('Team preserves all five original photographs, dimensions and captions on both presentations', () => {
  const expected = [
    ['aviwashere', '/team/aviwashere-299d5a86e64f.jpg', 905, 1280],
    ['kharab', '/team/kharab-9a7fa102c121.jpg', 1023, 1280],
    ['ducktor', '/team/ducktor-d0ab22eac7a8.jpg', 1023, 1280],
    ['jozi', '/team/jozi-630b9e15c22a.jpg', 1023, 1280],
    ['quanda', '/team/quanda-40c212fbddcd.jpg', 1023, 1280],
  ];
  for (const presentation of ['mobile', 'web']) {
    const team = nodes(fixture(true, presentation).render()).find(n => n.props['data-company-section'] === 'team');
    const figures = nodes(team).filter(n => n.type === 'figure');
    assert.deepEqual(figures.map(figure => {
      const photo = nodes(figure).find(n => n.type === 'img');
      assert.equal(photo.props.alt, '');
      assert.equal(photo.props.loading, 'lazy');
      assert.equal(photo.props.decoding, 'async');
      return [words(nodes(figure).find(n => n.type === 'figcaption')), photo.props.src, photo.props.width, photo.props.height];
    }), expected);
  }
});

test('WEB and MOBILE render identical entry content and controls from the shared markup', () => {
  const shape = tree => !React.isValidElement(tree) ? tree : {
    type: tree.type,
    props: Object.fromEntries(Object.entries(tree.props).filter(([name, value]) => !['children', 'ref', 'previewHost'].includes(name) && typeof value !== 'function')),
    children: React.Children.toArray(tree.props.children).map(shape),
  };
  const mobile = fixture(true, 'mobile', { theme: 'dark', highContrast: true, reduceTranslucency: true }).render();
  const web = fixture(true, 'web', { theme: 'dark', highContrast: true, reduceTranslucency: true }).render();
  assert.deepEqual(JSON.parse(JSON.stringify(shape(web))), JSON.parse(JSON.stringify(shape(mobile))));
});
