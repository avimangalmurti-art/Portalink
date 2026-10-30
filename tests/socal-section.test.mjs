import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { matchPath } from 'react-router-dom';
import { sourceModule } from './helpers/source-module.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, name) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === name || text(node).trim() === name));
const navigation = sourceModule('src/components/navigation.ts');
const routes = sourceModule('src/app/routes.ts', { '../components/navigation': navigation });

function routeHarness(path = '/p/creator', state = null, index = 0) {
  const calls = [];
  const history = { state: { idx: index } };
  const parseLocation = (address, nextState) => {
    const url = new URL(address, 'https://portalink.example.test');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state: nextState };
  };
  let location = parseLocation(path, state), locationRef;
  const navigate = (target, options) => {
    calls.push([target, options]);
    if (typeof target === 'number') { history.state.idx += target; return; }
    location = parseLocation(target, options?.state ?? null);
    if (!options?.replace) history.state.idx += 1;
  };
  const routing = sourceModule('src/app/useAppRoute.ts', {
    react: { useEffect() {}, useMemo: create => create(), useRef: value => locationRef ??= { current: value } },
    'react-router-dom': { matchPath, useLocation: () => location, useNavigate: () => navigate },
    './routes': routes,
    '../types/engagement': { activityKindFromSlug: value => ({ likes: 'like', saved: 'save', reposts: 'repost' })[value] },
    '../utils/projectContinuity': { beginProjectContinuity: () => false },
    '../features/profile/cataloguePageNavigation': { withCataloguePageTarget: value => value },
  }, { window: { history } });
  return { routing, calls, history, nav: () => routing.useRouteNavigator(), location: () => location };
}

test('SoCal addresses the profile in one account-protected URL without adding a public route', () => {
  const h = routeHarness('/p/creator/socal?profileId=someone-else');
  assert.equal(routes.buildPath('socal', { profileId: 'creator' }), '/p/creator/socal');
  assert.deepEqual(plain(h.routing.useAppRoute()), { kind: 'socal', profileId: 'creator' });
  assert.ok(h.routing.PROTECTED_ROUTE_KINDS.has('socal'));
  assert.deepEqual(plain(routeHarness('/share/creator/socal').routing.useAppRoute()), { kind: 'unknown' });
  assert.deepEqual(plain(routeHarness('/p/creator').routing.useAppRoute()), { kind: 'profile', profileId: 'creator' });
  assert.deepEqual(plain(routeHarness('/share/creator').routing.useAppRoute()), { kind: 'sharedProfile', profileId: 'creator' });
});

test('SoCal Back restores the exact profile tab through recorded history, including refresh', () => {
  const from = '/p/creator?view=portals#selected-work';
  const h = routeHarness(from, null, 3);
  h.nav().socal('creator');
  assert.deepEqual(plain(h.calls), [['/p/creator/socal', { state: { socalReturn: from } }]]);
  const refreshed = routeHarness('/p/creator/socal', plain(h.location().state), h.history.state.idx);
  refreshed.nav().closeSoCal('creator');
  assert.deepEqual(refreshed.calls, [[-1, undefined]]);
});

test('direct, copied, unrelated, and external SoCal return contexts safely replace the matching profile', () => {
  const unsafeReturns = [undefined, null, 2, '//elsewhere.test', 'https://elsewhere.test/p/creator', '/messages', '/p/another-person', '/share/creator', '/p/creator/socal'];
  for (const index of [0, 5]) for (const socalReturn of unsafeReturns) {
    const h = routeHarness('/p/creator/socal', { socalReturn }, index);
    h.nav().closeSoCal('creator');
    assert.deepEqual(plain(h.calls), [['/p/creator', { replace: true }]], `${String(socalReturn)} at history ${index}`);
  }
  const copied = routeHarness('/p/creator/socal', { socalReturn: '/p/creator?view=portals#work' }, 0);
  copied.nav().closeSoCal('creator');
  assert.deepEqual(plain(copied.calls), [['/p/creator', { replace: true }]]);
});

test('the optional SoCal action follows Collaboration without changing default or shared profile actions', () => {
  const fixed = Object.freeze([
    Object.freeze({ action: 'bio', label: 'Mission', href: '' }),
    Object.freeze({ action: 'collaboration', label: 'Collaboration', href: '' }),
    Object.freeze({ action: 'message', label: 'Message', href: '' }),
    Object.freeze({ label: 'Website', href: 'https://example.test', iconName: 'globe' }),
  ]);
  const { PlatformGrid } = sourceModule('src/components/profile/PlatformGrid.tsx', {
    react: React,
    'lucide-react': new Proxy({}, { get: (_target, name) => String(name) }),
    '../../features/profile/profileLinks': { isProfileLinkAction: value => ['bio', 'collaboration', 'message'].includes(value), profileLinkHref: value => value },
    './categoryIcons': { getCategoryIcon: () => 'external-link-icon' },
  });
  const props = { links: fixed, profileName: 'Creator', onOpenBio() {}, onCollaboration() {}, onMessage() {} };
  const actionNames = tree => nodes(tree).filter(node => node.type === 'button').map(node => node.props['aria-label']);
  assert.deepEqual(actionNames(PlatformGrid(props)), ['Mission', 'Collaboration', 'Message']);
  let opened = 0;
  const extended = PlatformGrid({ ...props, onSoCal: () => opened++ });
  assert.deepEqual(actionNames(extended), ['Mission', 'Collaboration', 'SoCal', 'Message']);
  button(extended, 'SoCal').props.onClick();
  assert.equal(opened, 1);
  assert.equal(nodes(extended).find(node => node.type === 'a').props.href, 'https://example.test');
  assert.equal(button(PlatformGrid({ ...props, isSharedView: true, onSoCal: () => opened++ }), 'SoCal'), undefined);
  assert.equal(fixed.length, 4, 'The optional entry never persists or mutates fixed profile links.');
});

const calendar = sourceModule('src/features/journey/calendar.ts', {}, { Date });
const today = '2026-10-30';
const profile = Object.freeze({ id: 'creator', name: 'Creator', categories: [], projects: [] });

/** Execute the real section with its hooks; private storage and network access fail the test. */
function sectionHarness(initial = {}) {
  const slots = [];
  let cursor = 0, dirty = true, tree, effects = [], props = { profile, isOwner: true, onBack() {}, ...initial };
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    useState(initialValue) { const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }]; },
    useRef(initialValue) { const index = cursor++; slots[index] ??= { current: initialValue }; return slots[index]; },
    useMemo(create, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: create() }; return slots[index].value; },
    useEffect(effect, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) { const previous = slots[index]; slots[index] = { dependencies }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); }); } },
    useId() { const index = cursor++; return slots[index] ??= `socal-test-${index}`; },
  };
  react.useCallback = (callback, dependencies) => react.useMemo(() => callback, dependencies);
  const noStorage = new Proxy({}, { get() { throw new Error('SoCal setup must not simulate account data with local storage.'); } });
  const { SoCalPage } = sourceModule('src/features/socal/SoCalPage.tsx', {
    react,
    'lucide-react': new Proxy({}, { get: (_target, name) => String(name) }),
    '../../components/ui/Button': { Button: 'button' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    '../journey/calendar': { ...calendar, localToday: () => today },
    './socal.css': {},
    './SoCalPage.css': {},
  }, { Date, Intl, localStorage: noStorage, sessionStorage: noStorage, window: { localStorage: noStorage, sessionStorage: noStorage }, fetch() { throw new Error('An unconfigured SoCal section must not perform network actions.'); } });
  function render() {
    let attempts = 0;
    while (dirty) {
      assert.ok(++attempts < 20, 'The section settles without a render loop.');
      cursor = 0; dirty = false; effects = [];
      tree = SoCalPage(props);
      effects.forEach(effect => effect());
    }
    return tree;
  }
  return {
    get tree() { return render(); },
    get nodes() { return nodes(render()); },
    button: label => button(render(), label),
    update(next) { props = { ...props, ...next }; dirty = true; return render(); },
  };
}

test('the owner calendar browses real dates and Today restores the current local day', () => {
  const h = sectionHarness();
  const selected = () => h.nodes.find(node => node.type === 'button' && node.props['data-socal-date'] && node.props['aria-pressed']);
  assert.equal(selected().props['data-socal-date'], today);
  const chosen = h.nodes.find(node => node.props['data-socal-date'] === '2026-10-11');
  assert.ok(chosen);
  chosen.props.onClick();
  assert.equal(selected().props['data-socal-date'], '2026-10-11');
  h.button('Next month').props.onClick();
  assert.ok(h.nodes.some(node => node.props['data-socal-date'] === '2026-11-01'));
  assert.equal(h.nodes.some(node => node.props['data-socal-date'] === '2026-10-11'), false);
  h.button('Today').props.onClick();
  assert.equal(selected().props['data-socal-date'], today);
});

test('unconfigured owner tabs do not claim running AI, existing plans, or saved planning rules', () => {
  const h = sectionHarness();
  const tabs = () => h.nodes.filter(node => node.type === 'button' && node.props.role === 'tab');
  assert.deepEqual(tabs().map(node => text(node).trim()), ['Calendar', 'Your AI', 'Rules']);
  for (const name of ['Calendar', 'Your AI', 'Rules']) {
    h.button(name).props.onClick();
    const output = text(h.tree);
    assert.match(output, /not (?:connected|active|available)|setup|set up|isn’t (?:connected|active|available)|aren’t (?:connected|active|available)/i, `${name} explains the unavailable capability.`);
    assert.doesNotMatch(output, /coffee with (?:Maya|Eli)|invitation sent|AI is active|automatically confirmed/i, 'The published section must not inherit the earlier concept’s simulated activity.');
    assert.equal(h.nodes.some(node => node.type === 'button' && /confirm|send invitation|save rules|auto.plan/i.test(text(node)) && !node.props.disabled), false);
  }
});

test('owner tab keyboard navigation updates selection and focuses its destination', () => {
  const h = sectionHarness(), focused = [];
  const tabs = () => h.nodes.filter(node => node.type === 'button' && node.props.role === 'tab');
  tabs().forEach((tab, index) => tab.ref({ focus() { focused.push(index); } }));
  let prevented = 0;
  tabs()[0].props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented++; } });
  assert.equal(text(tabs().find(tab => tab.props['aria-selected'])), 'Your AI');
  tabs()[1].props.onKeyDown({ key: 'End', preventDefault() { prevented++; } });
  assert.equal(text(tabs().find(tab => tab.props['aria-selected'])), 'Rules');
  tabs()[2].props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented++; } });
  const selected = tabs().find(tab => tab.props['aria-selected']);
  assert.equal(text(selected), 'Calendar');
  assert.equal(selected.props.tabIndex, 0);
  assert.equal(tabs().filter(tab => tab.props.tabIndex === 0).length, 1);
  const panel = h.nodes.find(node => node.props.role === 'tabpanel');
  assert.equal(selected.props['aria-controls'], panel.props.id);
  assert.equal(panel.props['aria-labelledby'], selected.props.id);
  assert.deepEqual(focused, [1, 2, 0]);
  assert.equal(prevented, 3);
});

test('a visitor never renders owner calendar, AI, or rules, including after an owner-tab transition', () => {
  const h = sectionHarness();
  h.button('Rules').props.onClick();
  h.update({ isOwner: false });
  assert.equal(h.nodes.some(node => node.props.role === 'tab'), false);
  assert.equal(h.nodes.some(node => node.props['data-socal-date']), false);
  assert.equal(h.button('Your AI'), undefined);
  assert.equal(h.button('Rules'), undefined);
  assert.match(text(h.tree), /Shared activities/);
  assert.match(text(h.tree), /Shared availability/);
});

test('visitor messaging and Back use existing explicit callbacks without fabricating a social invitation', () => {
  let messages = 0, backs = 0;
  const h = sectionHarness({ isOwner: false, onBack: () => backs++, onMessage: () => messages++ });
  h.button('Message Creator').props.onClick();
  assert.equal(messages, 1);
  h.button('Back to profile').props.onClick();
  assert.equal(backs, 1);
  assert.equal(h.nodes.some(node => node.type === 'button' && /send invitation|accept plan/i.test(text(node))), false);
  const noMessaging = sectionHarness({ isOwner: false });
  assert.equal(noMessaging.button('Message Creator'), undefined);
});
