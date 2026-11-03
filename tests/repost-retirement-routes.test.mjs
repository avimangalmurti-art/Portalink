import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPath } from 'react-router-dom';
import { sourceModule } from './helpers/source-module.mjs';

const engagement = sourceModule('src/types/engagement.ts');
const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const plain = value => JSON.parse(JSON.stringify(value));

function harness(path, presentation) {
  const calls = [];
  const url = new URL(path, 'https://portalink.example.test');
  const location = { pathname: url.pathname, search: url.search, hash: url.hash };
  const routing = sourceModule('src/app/useAppRoute.ts', {
    react: { useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }) },
    'react-router-dom': { matchPath, useLocation: () => location, useNavigate: () => (...args) => calls.push(args) },
    './routes': routes,
    '../types/engagement': engagement,
    '../utils/projectContinuity': { beginProjectContinuity: () => false },
    '../features/profile/cataloguePageNavigation': { withCataloguePageTarget: value => value },
  });
  return { routing, calls, nav: routing.useRouteNavigator(presentation) };
}

test('retired repost activity URLs cannot open an activity collection on either presentation', () => {
  for (const presentation of ['mobile', 'web']) {
    const retired = harness('/p/creator/activity/reposts?filter=recent#work', presentation);
    assert.deepEqual(plain(retired.routing.useAppRoute()), { kind: 'unknown' });
    retired.nav.activity('creator', 'repost');
    assert.deepEqual(retired.calls, [], 'Stale runtime callers cannot navigate to a retired collection.');
    for (const [slug, kind] of [['likes', 'like'], ['saved', 'save']]) {
      const current = harness(`/p/creator/activity/${slug}`, presentation);
      assert.deepEqual(plain(current.routing.useAppRoute()), { kind: 'activity', profileId: 'creator', activityKind: kind });
      current.nav.activity('creator', kind);
      assert.equal(current.calls[0][0], `/p/creator/activity/${slug}`);
    }
  }
});
