import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const links = tree => nodes(tree).filter(node => node.type === 'route-link');
const density = tree => nodes(tree).find(node => node.type === 'density-separator');
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props.children === label);
const portal = (id, profileId = 'creator-a', label = `Portal ${id}`) => ({ id, profileId, label, iconName: 'camera', creator: { id: profileId, name: `Creator ${profileId}`, handle: profileId, avatar: `/${profileId}.jpg` } });

function harness(initialQuery = '', account = 'account-a', options = {}) {
  let cursor = 0, dirty = true, mounted = true, tree, params = new URLSearchParams(initialQuery), timer = 0, back = 0;
  let effects = [];
  const slots = [], timers = new Map(), calls = [], navigations = [];
  const environment = { presentation: options.presentation ?? 'web' };
  const auth = { isAuthenticated: Boolean(account), isInitializing: false, phase: 'authenticated', user: account ? { id: account } : null, loginSession: {}, requestAuth(view) { navigations.push(view); } };
  const discovery = { listPublicPortals(query, offset) { const response = deferred(); calls.push({ query, offset, response }); return response.promise; } };
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        if (!mounted) return;
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) {
        const previous = slots[index]; slots[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const { PublicPortalSearchPage } = sourceModule('src/features/portals/PublicPortalSearchPage.tsx', {
    react,
    'react-router-dom': { Link: 'route-link', useNavigate: () => (path, options) => navigations.push({ path, options }), useLocation: () => ({ pathname: '/portal-search', search: params.toString() ? `?${params}` : '', state: { origin: 'profile' } }), useSearchParams: () => [params, (next, options) => { params = new URLSearchParams(next); navigations.push({ search: params.toString(), options }); dirty = true; }] },
    'lucide-react': { ChevronLeftIcon: 'back-icon', SearchIcon: 'search-icon' },
    '../../app/routes': routes,
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../contexts/ServicesContext': { useServices: () => ({ discovery }) },
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
    '../../components/profile/categoryIcons': { getCategoryIcon: value => `chosen:${value ?? 'default'}` },
    '../../components/ui/DensitySeparator': { DensitySeparator: 'density-separator' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../components/ui/StateViews': { EmptyState: 'empty', ErrorState: 'error', LoadingState: 'loading' },
    '../../presentation/usePresentation': { usePresentation: () => environment.presentation },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
    './public-portal-search.css': {},
    './WebPortalSearchPopup': { WebPortalSearchPopup: 'web-portal-popup' },
  }, { window: { setTimeout(callback, delay) { timers.set(++timer, { callback, delay }); return timer; }, clearTimeout(id) { timers.delete(id); } } });
  const render = () => {
    cursor = 0; dirty = false; effects = [];
    tree = PublicPortalSearchPage({ onBack() { back++; } });
    for (const effect of effects) effect();
    return tree;
  };
  return {
    calls, auth, navigations, timers, environment,
    get tree() { if (dirty) render(); return tree; },
    get back() { return back; },
    rerender() { dirty = true; return this.tree; },
    search(query) { nodes(this.tree).find(node => node.type === 'input' && node.props.type === 'search').props.onChange({ currentTarget: { value: query } }); return this.tree; },
    runTimers() { const pending = [...timers.values()]; timers.clear(); for (const task of pending) task.callback(); },
    async flush() { for (let index = 0; index < 20; index++) { if (dirty) render(); await Promise.resolve(); } return tree; },
    dispose() { for (const slot of slots) slot?.cleanup?.(); mounted = false; },
  };
}

test('the portal directory keeps one visible Back control and registers its action only for the active MOBILE screen', () => {
  const h = harness(); const tree = h.tree;
  const wrapper = nodes(tree).find(node => node.type === 'screen-back');
  const back = nodes(tree).filter(node => node.type === 'button' && node.props['aria-label'] === 'Go back');
  assert.ok(wrapper); assert.equal(wrapper.props.visibleOnMobile, true); assert.equal(back.length, 1);
  assert.equal(wrapper.props.action, back[0].props.onClick);
  for (const [presentation, active, enabled, shouldRegister] of [['mobile', true, true, true], ['mobile', false, true, false], ['mobile', true, false, false], ['web', true, true, false]]) {
    const effects = [], registered = [];
    const navigation = { register(action) { registered.push(action); return () => {}; }, registerSwipe() { return () => {}; } };
    const { ScreenBack } = sourceModule('src/presentation/mobile/MobileBackNavigation.tsx', {
      react: { ...React, createContext: initial => ({ initial }), useContext: context => context.initial === null ? navigation : { active, enabled }, useLayoutEffect: effect => effects.push(effect) },
      '../usePresentation': { usePresentation: () => presentation },
      './useMobileBackSwipe': { useMobileBackSwipe() {} },
    });
    const rendered = ScreenBack(wrapper.props); effects.forEach(effect => effect());
    assert.equal(registered.length, shouldRegister ? 1 : 0, `${presentation}/${active}/${enabled}`);
    assert.equal(nodes(rendered).filter(node => node.type === 'button' && node.props['aria-label'] === 'Go back').length, 1);
    if (shouldRegister) registered[0]();
  }
  assert.equal(h.back, 1); back[0].props.onClick(); assert.equal(h.back, 2); h.dispose();
});

test('public portal grid uses each chosen icon, creator avatar, portal name and canonical category link', async () => {
  const h = harness();
  assert.equal(nodes(h.tree).some(node => node.type === 'loading'), true);
  h.runTimers(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].offset, 0);
  h.calls[0].response.resolve({ items: [portal('a'), portal('b', 'creator-b', 'Typography')], nextOffset: null });
  const tree = await h.flush();
  assert.deepEqual(links(tree).map(node => node.props.to), ['/p/creator-a/c/a', '/p/creator-b/c/b']);
  assert.deepEqual(links(tree).map(node => node.props.title), ['Portal a — Creator creator-a', 'Typography — Creator creator-b']);
  assert.equal(nodes(tree).filter(node => node.props.className === 'public-portal-glyph').length, 2);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'creator-avatar').map(node => [node.props.name, node.props.avatar]), [['Creator creator-a', '/creator-a.jpg'], ['Creator creator-b', '/creator-b.jpg']]);
  assert.equal(nodes(tree).filter(node => node.type === 'interface-icon' && node.props.icon === 'chosen:camera').length, 2);
  assert.equal(button(tree, 'Show more'), undefined);
  nodes(tree).find(node => node.props['aria-label'] === 'Go back').props.onClick(); assert.equal(h.back, 1);
  h.dispose();
});

test('each portal tile uses its creator accent without recoloring labels, avatars or the viewer interface', async () => {
  const h = harness(); h.tree; h.runTimers();
  const first = portal('a'), second = portal('b', 'creator-b'), legacy = portal('c', 'creator-c');
  first.creator.accentColor = '#AF1e55'; second.creator.accentColor = '#007a31';
  h.calls[0].response.resolve({ items: [first, second, legacy], nextOffset: null });
  const tree = await h.flush();
  const tiles = nodes(tree).filter(node => node.props.className === 'public-portal-glyph');
  assert.deepEqual(tiles.map(node => node.props.style?.backgroundColor), [undefined, undefined, undefined]);
  const glyphs = nodes(tree).filter(node => node.type === 'interface-icon' && node.props.icon === 'chosen:camera');
  assert.deepEqual(glyphs.map(node => node.props.style?.color), ['#AF1e55', '#007a31', 'var(--text-secondary)']);
  assert.deepEqual(glyphs.map(node => node.props.keepColor), [true, true, true]);
  assert.ok(links(tree).every(node => node.props.style === undefined));
  assert.ok(nodes(tree).filter(node => node.type === 'creator-avatar' || node.props.className === 'profile-collection-name' || node.props.className === 'public-portal-creator-name').every(node => node.props.style === undefined));
  assert.equal(tree.props.style['--portal-search-columns'], 6);
  h.dispose();
});

test('MOBILE and WEB use creator-coloured glyphs on named neutral cards', async () => {
  const item = portal('long', 'creator-b', 'A long structural engineering portal name');
  const legacy = portal('legacy', 'creator-c', 'Legacy portal');
  item.creator.name = 'A creator with a longer public name';
  item.creator.accentColor = '#8a44bb';
  for (const presentation of ['mobile', 'web']) {
    const h = harness('', 'account-a', { presentation });
    assert.equal(nodes(h.tree).find(node => node.type === 'loading').props.columns, presentation === 'mobile' ? 3 : undefined);
    h.runTimers();
    h.calls[0].response.resolve({ items: [item, legacy], nextOffset: null });
    const tree = await h.flush(); const link = links(tree)[0];
    assert.equal(link.props.to, '/p/creator-b/c/long');
    assert.equal(link.props.title, `${item.label} — ${item.creator.name}`);
    assert.equal(link.props['aria-label'], `${item.label} — ${item.creator.name}`);
    const mobile = presentation === 'mobile';
    const tileClass = 'public-portal-glyph';
    const tile = nodes(link).find(node => node.props.className === tileClass);
    assert.equal(link.props['data-ui-shape'], 'row');
    assert.equal(tile.props.style?.backgroundColor, undefined);
    const glyph = nodes(link).find(node => node.type === 'interface-icon' && node.props.icon === 'chosen:camera');
    assert.equal(glyph.props.keepColor, true);
    assert.equal(glyph.props.style.color, item.creator.accentColor);
    const avatar = nodes(link).find(node => node.type === 'creator-avatar');
    assert.equal(avatar.props.name, item.creator.name); assert.equal(avatar.props.avatar, '/creator-b.jpg');
    const creatorLabel = nodes(link).find(node => node.props.className?.split(' ').includes('public-portal-creator-name'));
    assert.equal(creatorLabel, undefined);
    assert.equal(nodes(link).find(node => node.props.className === 'profile-collection-name').props.children, item.label);
    const legacyLink = links(tree)[1];
    assert.equal(legacyLink.props.to, '/p/creator-c/c/legacy');
    const legacyTile = nodes(legacyLink).find(node => node.props.className === tileClass);
    assert.equal(legacyTile.props.style, undefined, 'A missing creator accent keeps the neutral tile instead of borrowing a viewer accent.');
    const legacyGlyph = nodes(legacyLink).find(node => node.type === 'interface-icon' && node.props.icon === 'chosen:camera');
    assert.equal(legacyGlyph.props.keepColor, true);
    assert.equal(legacyGlyph.props.style?.color, 'var(--text-secondary)');
    assert.equal(nodes(legacyLink).find(node => node.type === 'creator-avatar').props.avatar, legacy.creator.avatar);
    h.dispose();
  }
});

test('switching presentation keeps loaded portal names and canonical links without rereading data', async () => {
  const h = harness('', 'account-a', { presentation: 'mobile' }); h.tree; h.runTimers();
  h.calls[0].response.resolve({ items: [portal('a')], nextOffset: null }); await h.flush();
  for (const presentation of ['web', 'mobile']) {
    h.environment.presentation = presentation;
    const tree = h.rerender();
    assert.deepEqual(links(tree).map(node => node.props.to), ['/p/creator-a/c/a']);
    assert.equal(nodes(tree).find(node => node.props.className === 'profile-collection-name').props.children, 'Portal a');
  }
  assert.equal(h.calls.length, 1); h.dispose();
});

function activate(link, modifiers = {}) {
  let prevented = false;
  link.props.onClick?.({ button: 0, defaultPrevented: false, ...modifiers, preventDefault() { prevented = true; } });
  return prevented;
}

test('WEB plain activation opens a chooser over the retained query and only its chosen project navigates', async () => {
  const h = harness('q=paper&keep=yes'); h.tree; h.runTimers();
  const item = portal('paper'); h.calls[0].response.resolve({ items: [item], nextOffset: null }); await h.flush();
  assert.equal(nodes(h.tree).find(node => node.type === 'h1').props.className, 'sr-only');
  assert.equal(activate(links(h.tree)[0]), true);
  const popup = nodes(h.tree).find(node => node.type === 'web-portal-popup');
  assert.equal(popup.props.portal, item);
  assert.deepEqual(h.navigations, []);
  assert.equal(nodes(h.tree).find(node => node.props.type === 'search').props.value, 'paper');
  popup.props.onSelect('other-creator', 'paper', 'work');
  assert.deepEqual(h.navigations, []);
  popup.props.onSelect('creator-a', 'paper', 'work');
  assert.deepEqual(h.navigations, [{ path: '/p/creator-a/c/paper/work', options: undefined }]);
  assert.equal(nodes(h.tree).find(node => node.type === 'web-portal-popup'), undefined);
  assert.equal(h.calls.length, 1);
  h.dispose();
});

test('WEB modifiers and middle clicks retain the canonical link while MOBILE activation is unchanged', async () => {
  const h = harness(); h.tree; h.runTimers(); h.calls[0].response.resolve({ items: [portal('a')], nextOffset: null }); await h.flush();
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.equal(activate(links(h.tree)[0], modifiers), false);
    assert.equal(nodes(h.tree).find(node => node.type === 'web-portal-popup'), undefined);
    assert.equal(links(h.tree)[0].props.to, '/p/creator-a/c/a');
  }
  h.environment.presentation = 'mobile';
  assert.equal(links(h.rerender())[0].props.onClick, undefined);
  assert.equal(links(h.tree)[0].props.to, '/p/creator-a/c/a');
  h.dispose();
});

test('a chooser is invalidated immediately across query, account, login, presentation and auth transitions', async () => {
  for (const change of [h => h.search('another'), h => { h.auth.user = { id: 'other' }; }, h => { h.auth.loginSession = {}; },
    h => { h.environment.presentation = 'mobile'; }, h => { h.auth.phase = 'signing-out'; }]) {
    const h = harness(); h.tree; h.runTimers(); h.calls[0].response.resolve({ items: [portal('a')], nextOffset: null }); await h.flush();
    activate(links(h.tree)[0]); const old = nodes(h.tree).find(node => node.type === 'web-portal-popup');
    change(h); const tree = h.rerender();
    assert.equal(nodes(tree).find(node => node.type === 'web-portal-popup'), undefined);
    const before = h.navigations.length; old.props.onSelect('creator-a', 'a', 'work');
    assert.equal(h.navigations.length, before, 'A callback from a dismissed scope cannot navigate');
    h.dispose();
  }
});

test('Back closes only the chosen WEB portal and preserves directory data and query', async () => {
  const h = harness('q=art'); h.tree; h.runTimers(); h.calls[0].response.resolve({ items: [portal('a'), portal('b')], nextOffset: null }); await h.flush();
  activate(links(h.tree)[0]); const first = nodes(h.tree).find(node => node.type === 'web-portal-popup');
  activate(links(h.tree)[1]); first.props.onClose();
  const second = nodes(h.tree).find(node => node.type === 'web-portal-popup');
  assert.equal(second.props.portal.id, 'b');
  second.props.onClose();
  assert.equal(nodes(h.tree).find(node => node.type === 'web-portal-popup'), undefined);
  assert.equal(nodes(h.tree).find(node => node.props.type === 'search').props.value, 'art');
  assert.equal(links(h.tree).length, 2); assert.equal(h.calls.length, 1); assert.deepEqual(h.navigations, []);
  h.dispose();
});

test('MOBILE portal density previews and commits the same columns for the grid and loading state without refetching', async () => {
  const h = harness('q=paper', 'account-a', { presentation: 'mobile' });
  assert.equal(density(h.tree).props.label, 'Portals per row');
  assert.equal(density(h.tree).props.maxColumns, 5);
  assert.equal(density(h.tree).props.columns, 3);
  assert.equal(h.tree.props.style['--portal-search-columns'], 3);
  assert.equal(nodes(h.tree).find(node => node.type === 'loading').props.columns, 3);

  h.runTimers();
  h.calls[0].response.resolve({ items: [portal('paper')], nextOffset: 48 });
  await h.flush();
  density(h.tree).props.onPreview(5);
  assert.equal(density(h.tree).props.columns, 5);
  assert.equal(h.tree.props.style['--portal-search-columns'], 5);
  density(h.tree).props.onChange(4);
  assert.equal(density(h.tree).props.columns, 4);
  assert.equal(h.tree.props.style['--portal-search-columns'], 4);
  assert.deepEqual(links(h.tree).map(node => node.props.to), ['/p/creator-a/c/paper']);
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.navigations, []);

  button(h.tree, 'Show more').props.onClick();
  assert.equal(h.calls[1].offset, 48);
  h.calls[1].response.resolve({ items: [portal('fold')], nextOffset: null });
  await h.flush();
  assert.equal(links(h.tree).length, 2);
  assert.equal(h.tree.props.style['--portal-search-columns'], 4);

  h.search('photo');
  assert.equal(nodes(h.tree).find(node => node.type === 'loading').props.columns, 4);
  h.runTimers();
  assert.deepEqual(h.calls.map(call => [call.query, call.offset]), [['paper', 0], ['paper', 48], ['photo', 0]]);
  h.calls[2].response.resolve({ items: [portal('photo')], nextOffset: null });
  await h.flush();
  h.environment.presentation = 'web';
  assert.equal(density(h.rerender()).props.columns, 6);
  assert.equal(density(h.tree).props.maxColumns, 13);
  assert.equal(h.tree.props.style['--portal-search-columns'], 6);
  density(h.tree).props.onChange(10);
  h.environment.presentation = 'mobile';
  assert.equal(density(h.rerender()).props.columns, 4);
  h.environment.presentation = 'web';
  assert.equal(density(h.rerender()).props.columns, 10);
  assert.deepEqual(links(h.tree).map(node => node.props.to), ['/p/creator-a/c/photo']);
  h.dispose();
});

test('portal name search is debounced and preserved in the canonical URL without a new history entry per key', async () => {
  const h = harness('q=old&keep=yes'); h.tree;
  assert.equal([...h.timers.values()][0].delay, 220);
  h.search(' Photo '); h.search('Photography');
  assert.equal(h.timers.size, 1); assert.equal(h.calls.length, 0);
  h.runTimers(); assert.deepEqual(h.calls.map(call => [call.query, call.offset]), [['Photography', 0]]);
  assert.equal(h.navigations.at(-1).search, 'q=Photography&keep=yes');
  assert.equal(h.navigations.at(-1).options.replace, true);
  assert.equal(h.navigations.at(-1).options.state.origin, 'profile');
  h.calls[0].response.resolve({ items: [], nextOffset: null });
  assert.equal(nodes(await h.flush()).find(node => node.type === 'empty').props.title, 'No portals found');
  h.search('   '); h.runTimers(); assert.equal(h.calls[1].query, '');
  h.calls[1].response.resolve({ items: [], nextOffset: null });
  assert.equal(nodes(await h.flush()).find(node => node.type === 'empty').props.title, 'No public portals yet');
  h.dispose();
});

test('a late search response never replaces the current query or exposes old cards while a new search loads', async () => {
  const h = harness(); h.tree; h.runTimers();
  h.search('new'); assert.equal(links(h.tree).length, 0); h.runTimers();
  h.calls[1].response.resolve({ items: [portal('new')], nextOffset: null }); await h.flush();
  h.calls[0].response.resolve({ items: [portal('old')], nextOffset: 48 });
  assert.deepEqual(links(await h.flush()).map(node => node.props.to), ['/p/creator-a/c/new']);
  h.search('next'); assert.equal(links(h.tree).length, 0); assert.equal(nodes(h.tree).some(node => node.type === 'loading'), true);
  h.dispose();
});

test('pagination uses the service cursor, dedupes overlapping portals and prevents simultaneous page reads', async () => {
  const h = harness(); h.tree; h.runTimers();
  h.calls[0].response.resolve({ items: [portal('a'), portal('b')], nextOffset: 48 }); await h.flush();
  const more = button(h.tree, 'Show more'); more.props.onClick(); more.props.onClick();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].offset, 48);
  assert.equal(button(h.tree, 'Show more').props.disabled, true);
  h.calls[1].response.resolve({ items: [portal('b'), portal('c', 'creator-c')], nextOffset: null });
  assert.deepEqual(links(await h.flush()).map(node => node.props.to), ['/p/creator-a/c/a', '/p/creator-a/c/b', '/p/creator-c/c/c']);
  assert.equal(button(h.tree, 'Show more'), undefined); h.dispose();
});

test('a failed extra page retains results and retries that page instead of discarding the loaded directory', async () => {
  const h = harness(); h.tree; h.runTimers();
  h.calls[0].response.resolve({ items: [portal('a')], nextOffset: 48 }); await h.flush();
  button(h.tree, 'Show more').props.onClick(); h.calls[1].response.reject(new Error('network detail'));
  const failed = await h.flush(); const error = nodes(failed).find(node => node.type === 'error');
  assert.equal(error.props.title, 'More portals could not be loaded'); assert.equal(links(failed).length, 1);
  assert.doesNotMatch(error.props.description, /network detail/);
  error.props.onRetry(); assert.equal(h.calls[2].offset, 48);
  h.calls[2].response.resolve({ items: [portal('b')], nextOffset: null });
  assert.equal(links(await h.flush()).length, 2); h.dispose();
});

test('an older next page cannot append cards or an error to a different search', async () => {
  for (const finish of ['resolve', 'reject']) {
    const h = harness(); h.tree; h.runTimers();
    h.calls[0].response.resolve({ items: [portal('a')], nextOffset: 48 }); await h.flush();
    button(h.tree, 'Show more').props.onClick();
    h.search('new'); h.runTimers();
    h.calls[2].response.resolve({ items: [portal('new')], nextOffset: null }); await h.flush();
    if (finish === 'resolve') h.calls[1].response.resolve({ items: [portal('old-page')], nextOffset: 96 });
    else h.calls[1].response.reject(new Error('old query failure'));
    const tree = await h.flush();
    assert.deepEqual(links(tree).map(node => node.props.to), ['/p/creator-a/c/new']);
    assert.equal(nodes(tree).some(node => node.type === 'error'), false); h.dispose();
  }
});

test('initial failure offers retry and never fabricates directory cards', async () => {
  const h = harness(); h.tree; h.runTimers(); h.calls[0].response.reject(new Error('read refused'));
  const failed = await h.flush(); const error = nodes(failed).find(node => node.type === 'error');
  assert.equal(error.props.title, 'Public portals could not be loaded'); assert.equal(links(failed).length, 0);
  error.props.onRetry(); h.tree; h.runTimers(); assert.equal(h.calls[1].offset, 0);
  h.calls[1].response.resolve({ items: [portal('recovered')], nextOffset: null });
  assert.equal(links(await h.flush()).length, 1); h.dispose();
});

test('sign-out immediately hides portal results and late account responses cannot cross a new login identity', async () => {
  const h = harness(); h.tree; h.runTimers();
  h.calls[0].response.resolve({ items: [portal('a')], nextOffset: 48 }); await h.flush();
  button(h.tree, 'Show more').props.onClick();
  h.auth.isAuthenticated = false; h.auth.user = null; h.auth.loginSession = {};
  assert.equal(links(h.rerender()).length, 0); assert.equal(nodes(h.tree).find(node => node.type === 'input').props.disabled, true);
  h.calls[1].response.resolve({ items: [portal('old-account')], nextOffset: null }); await h.flush();
  assert.equal(links(h.tree).length, 0); assert.equal(h.calls.length, 2);
  h.auth.isAuthenticated = true; h.auth.user = { id: 'account-b' }; h.auth.loginSession = {};
  h.rerender(); h.runTimers(); h.calls[2].response.resolve({ items: [portal('b', 'creator-b')], nextOffset: null });
  assert.deepEqual(links(await h.flush()).map(node => node.props.to), ['/p/creator-b/c/b']); h.dispose();
});

test('same-account relogin invalidates an older request and authentication transitions perform no reads', async () => {
  const h = harness(); h.tree; h.runTimers();
  h.auth.loginSession = {}; h.rerender(); h.runTimers();
  h.calls[0].response.resolve({ items: [portal('stale')], nextOffset: null }); await h.flush();
  assert.equal(links(h.tree).length, 0);
  h.calls[1].response.resolve({ items: [portal('current')], nextOffset: null }); await h.flush(); assert.equal(links(h.tree).length, 1);
  h.auth.phase = 'signing-out'; assert.equal(links(h.rerender()).length, 0);
  h.runTimers(); assert.equal(h.calls.length, 2); h.dispose();
  const signedOut = harness('', null); signedOut.tree; signedOut.runTimers(); assert.equal(signedOut.calls.length, 0);
  nodes(signedOut.tree).find(node => node.type === 'empty').props.action.onClick(); assert.deepEqual(signedOut.navigations, ['signIn']); signedOut.dispose();
});
