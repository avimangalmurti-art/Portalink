import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPath } from 'react-router-dom';
import { sourceModule } from './helpers/source-module.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const routes = sourceModule('src/app/routes.ts', { '../components/navigation': sourceModule('src/components/navigation.ts') });
function routeHarness(path = '/', state = null, index = 0) {
  const calls = [], effects = [], history = { state: { idx: index } };
  const parseLocation = (address, nextState) => {
    const url = new URL(address, 'https://portalink.example.test');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state: nextState };
  };
  let location = parseLocation(path, state), locationRef;
  const navigate = (target, options) => {
    calls.push([target, options]);
    if (typeof target === 'number') return;
    location = parseLocation(target, options?.state ?? null);
    if (!options?.replace) history.state.idx++;
  };
  const routing = sourceModule('src/app/useAppRoute.ts', {
    react: { useEffect: effect => effects.push(effect), useMemo: create => create(), useRef: value => locationRef ??= { current: value } },
    'react-router-dom': { matchPath, useLocation: () => location, useNavigate: () => navigate }, './routes': routes,
    '../types/engagement': sourceModule('src/types/engagement.ts'),
    '../utils/projectContinuity': { beginProjectContinuity: () => false },
    '../features/profile/cataloguePageNavigation': { withCataloguePageTarget: value => value },
  }, { window: { history } });
  return { routing, calls, history, nav: () => routing.useRouteNavigator(), location: () => location,
    flushEffects() { effects.splice(0).forEach(effect => effect()); } };
}

test('retired private calendar addresses resolve only to protected portal search without a profile selection', () => {
  for (const path of ['/p/creator/socal', '/p/another-person/socal/', '/p/creator/socal?profileId=someone-else&tab=rules#calendar']) {
    const h = routeHarness(path);
    assert.deepEqual(plain(h.routing.useAppRoute()), { kind: 'portalSearch' });
    assert.ok(h.routing.PROTECTED_ROUTE_KINDS.has('portalSearch'));
    assert.equal(h.routing.describeRoute(h.routing.useAppRoute()), 'search public portals');
    assert.equal(h.routing.useAppRoute().profileId, undefined, 'The retired URL cannot request creator or calendar data');
  }
  assert.equal(Object.hasOwn(routes.routes, 'socal'), false);
  assert.equal(Object.hasOwn(routeHarness().nav(), 'socal'), false);
  assert.equal(Object.hasOwn(routeHarness().nav(), 'closeSoCal'), false);
});

test('legacy calendar replacement discards retired state without growing history or reopening the old screen', () => {
  for (const index of [0, 4]) {
    const h = routeHarness('/p/creator/socal?tab=rules&date=2026-10-31#selected', {
      dockEntry: 'socal', socalFromDock: true, socalReturn: 'https://outside.example/', socalReturnIndex: 3,
    }, index);
    h.routing.useAppRoute(); h.flushEffects();
    assert.deepEqual(plain(h.calls), [['/portal-search', { replace: true }]]);
    assert.equal(h.history.state.idx, index);
    assert.deepEqual(plain(h.location()), { pathname: '/portal-search', search: '', hash: '', state: null });
    assert.deepEqual(plain(h.routing.useAppRoute()), { kind: 'portalSearch' }); h.flushEffects();
    assert.equal(h.calls.length, 1);
  }
});

test('shared calendar URLs stay unavailable while ordinary profile and collaboration routes are preserved', () => {
  for (const path of ['/share/creator/socal', '/share/creator/socal/extra', '/p/creator/socal/extra']) {
    const h = routeHarness(path);
    assert.deepEqual(plain(h.routing.useAppRoute()), { kind: 'unknown' }); h.flushEffects(); assert.deepEqual(h.calls, []);
  }
  for (const [path, kind] of [['/p/creator', 'profile'], ['/share/creator', 'sharedProfile'], ['/p/creator/collaboration', 'collaboration'], ['/share/creator/collaboration', 'sharedCollaboration']]) {
    const h = routeHarness(path);
    assert.deepEqual(plain(h.routing.useAppRoute()), { kind, profileId: 'creator' }); h.flushEffects(); assert.deepEqual(h.calls, []);
  }
  const h = routeHarness('/p/creator?view=portals#work', null, 3);
  h.nav().collaboration('creator');
  assert.deepEqual(plain(h.calls.at(-1)), ['/p/creator/collaboration', { state: { collaborationReturn: '/p/creator?view=portals#work' } }]);
  h.nav().closeCollaboration('creator'); assert.deepEqual(h.calls.at(-1), [-1, undefined]);
  h.nav().portalSearch(); assert.deepEqual(h.calls.at(-1), ['/portal-search', undefined]);
});

test('retired calendar warming downloads only the existing portal directory and exposes no calendar loader', async () => {
  const reads = [];
  const modules = sourceModule('src/app/screenModules.ts', {
    '../features/portals/PublicPortalSearchPage': { get PublicPortalSearchPage() { reads.push('portal-search'); return 'portal-search'; } },
  });
  assert.equal(Object.hasOwn(modules, 'loadSoCalPage'), false);
  const warmed = await modules.warmScreenForPath('/p/creator/socal?tab=calendar');
  assert.equal(warmed[0].status, 'fulfilled'); assert.deepEqual(plain(warmed[0].value), { default: 'portal-search' });
  await modules.warmScreenForPath('/portal-search');
  assert.deepEqual(reads, ['portal-search'], 'Legacy and canonical addresses share one existing download');
});
