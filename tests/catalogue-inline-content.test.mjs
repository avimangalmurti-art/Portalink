import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const equalDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const summary = { id: 'work', categoryId: 'portal', title: 'Actual work', summary: '', attachments: [] };
const fullView = (extra = {}) => ({ creator: { id: 'creator', name: 'Creator', avatar: '', isPrivate: false }, project: {
  ...summary, attachments: [{ id: 'a', kind: 'image', order: 0 }, { id: 'b', kind: 'image', order: 1 }, { id: 'c', kind: 'document', order: 2 }], ...extra,
} });

function fixture() {
  let current;
  const state = { account: 'account', scope: {}, revision: 0, path: '/p/creator', calls: [], requests: [], observations: [] };
  state.projects = { getProjectView(id) { state.calls.push(id); const request = deferred(); state.requests.push(request); return request.promise; } };
  const react = {
    useState(initial) {
      const runner = current, index = runner.cursor++;
      if (!runner.slots[index]) runner.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = runner.slots[index];
      return [slot.value, value => { const next = typeof value === 'function' ? value(slot.value) : value; if (!Object.is(next, slot.value)) { slot.value = next; runner.dirty = true; } }];
    },
    useMemo(compute, deps) {
      const runner = current, index = runner.cursor++, old = runner.slots[index];
      if (!old || !equalDeps(old.deps, deps)) runner.slots[index] = { deps, value: compute() };
      return runner.slots[index].value;
    },
    useEffect(effect, deps) {
      const runner = current, index = runner.cursor++, old = runner.slots[index];
      if (!old || !equalDeps(old.deps, deps)) {
        runner.slots[index] = { deps, cleanup: old?.cleanup };
        runner.effects.push(() => { runner.slots[index].cleanup?.(); runner.slots[index].cleanup = effect(); });
      }
    },
  };
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
  const api = sourceModule('src/features/profile/useInlineProjectContent.ts', {
    react, 'react-router-dom': { useLocation: () => ({ pathname: state.path }) },
    '../../contexts/ServicesContext': { useServices: () => ({ projects: state.projects }) },
    '../../contexts/AuthContext': { useAuth: () => ({ user: state.account ? { id: state.account } : null }) },
    '../../contexts/ProfileDataContext': { useProfileData: () => ({ scope: state.scope, revision: state.revision }) },
    '../sharing/shareModel': { isPublicSharePath: path => path.startsWith('/share/') || path === '/portalite' },
  }, {
    Error,
    IntersectionObserver: class {
      constructor(callback, options) { this.callback = callback; this.options = options; state.observations.push(this); }
      observe(host) { this.host = host; }
      disconnect() { this.disconnected = true; }
      show(visible = true) { this.callback([{ isIntersecting: visible }]); }
    },
  });
  const runner = (options = {}) => ({
    slots: [], cursor: 0, effects: [], dirty: true,
    options: { project: summary, creatorId: 'creator', enabled: true, active: true, hostRef: { current: {} }, ...options },
    render() { this.cursor = 0; this.dirty = false; current = this; this.result = api.useInlineProjectContent(this.options); this.effects.splice(0).forEach(run => run()); return this.result; },
    async flush() { for (let attempt = 0; attempt < 30; attempt++) { if (this.dirty) this.render(); await Promise.resolve(); } return this.result; },
    update(values = {}) { Object.assign(this.options, values); this.dirty = true; },
    unmount() { this.slots.forEach(slot => slot.cleanup?.()); },
  });
  return { state, runner };
}

test('cover summaries never become complete until a nearby one-column card resolves its existing service', async () => {
  const { state, runner } = fixture(), h = runner({ enabled: false });
  await h.flush(); assert.equal(state.calls.length, 0); assert.equal(state.observations.length, 0);
  assert.equal(h.result.project, summary); assert.equal(h.result.metadataComplete, false);
  h.update({ enabled: true }); await h.flush();
  assert.equal(state.calls.length, 0, 'Enabling density must not hydrate offscreen projects.');
  assert.equal(state.observations.at(-1).options.rootMargin, '240px 0px');
  state.observations.at(-1).show(); await h.flush();
  assert.deepEqual(state.calls, ['work']); assert.equal(h.result.loading, true);
  const full = fullView(); state.requests[0].resolve(full); await h.flush();
  assert.equal(h.result.project, full.project); assert.equal(h.result.metadataComplete, true); assert.equal(h.result.loading, false);
  assert.equal(h.result.project.attachments.length, 3); assert.equal(summary.attachments.length, 0, 'Do not mutate the grid cover record.');
  h.update({ enabled: false }); await h.flush();
  assert.equal(h.result.project, full.project, 'Denser grids may normalize against confirmed pages without another load.');
  assert.equal(state.calls.length, 1); h.unmount();
});

test('nearby duplicate cards share one pending canonical read and preserve loaded data across remount', async () => {
  const { state, runner } = fixture(), a = runner(), b = runner();
  await a.flush(); await b.flush(); state.observations.forEach(observer => observer.show()); await a.flush(); await b.flush();
  assert.equal(state.calls.length, 1);
  const full = fullView(); state.requests[0].resolve(full); await a.flush(); await b.flush();
  assert.equal(a.result.project, full.project); assert.equal(b.result.project, full.project);
  a.unmount(); b.unmount(); const c = runner({ enabled: false }); await c.flush();
  assert.equal(c.result.metadataComplete, true); assert.equal(c.result.project, full.project); assert.equal(state.calls.length, 1); c.unmount();
});

test('inactive layers do not load and reentering density rechecks proximity', async () => {
  const { state, runner } = fixture(), h = runner({ active: false });
  await h.flush(); assert.equal(state.observations.length, 0);
  h.update({ active: true }); await h.flush(); state.observations.at(-1).show(); await h.flush();
  assert.equal(state.calls.length, 1); state.requests[0].reject(new Error('Offline')); await h.flush();
  assert.equal(h.result.error, 'Offline'); assert.equal(h.result.metadataComplete, false);
  h.update({ enabled: false }); await h.flush(); h.result.retry(); await h.flush();
  h.update({ enabled: true }); await h.flush();
  assert.equal(state.calls.length, 1, 'A stale near flag cannot load after changing density.');
  state.observations.at(-1).show(); await h.flush(); assert.equal(state.calls.length, 2); h.unmount();
});

test('account, service and profile invalidation scopes cannot reveal a previous full response', async () => {
  const { state, runner } = fixture(), h = runner();
  await h.flush(); state.observations.at(-1).show(); await h.flush();
  const stale = state.requests[0]; state.account = 'other'; state.scope = {}; h.update(); await h.flush();
  stale.resolve(fullView()); await h.flush(); assert.equal(h.result.metadataComplete, false); assert.equal(h.result.project, summary);
  state.observations.at(-1).show(); await h.flush(); state.requests[1].resolve(fullView()); await h.flush();
  assert.equal(h.result.metadataComplete, true);
  state.revision++; h.update(); await h.flush(); assert.equal(h.result.metadataComplete, false);
  state.projects = { getProjectView: state.projects.getProjectView }; h.update(); await h.flush();
  assert.equal(h.result.metadataComplete, false); assert.equal(state.calls.length, 2); h.unmount();
});

test('public reads reject private, hidden, wrong-creator and wrong-category responses without broad fallbacks', async () => {
  for (const invalid of [
    () => ({ ...fullView(), creator: { ...fullView().creator, isPrivate: true } }),
    () => fullView({ isPubliclyVisible: false }),
    () => ({ ...fullView(), creator: { ...fullView().creator, id: 'other' } }),
    () => fullView({ categoryId: 'other' }),
    () => fullView({ id: 'other' }),
    () => fullView({ attachments: undefined }),
  ]) {
    const { state, runner } = fixture(); state.path = '/portalite'; const h = runner();
    await h.flush(); state.observations.at(-1).show(); await h.flush(); state.requests[0].resolve(invalid()); await h.flush();
    assert.equal(h.result.metadataComplete, false); assert.equal(h.result.project, summary); assert.ok(h.result.error);
    await h.flush(); assert.equal(state.calls.length, 1, 'A denied read must not loop or use a broader service.'); h.unmount();
  }
});

test('public cache is separate from owner data and an explicit retry preserves the cover on failure', async () => {
  const { state, runner } = fixture(), h = runner();
  await h.flush(); state.observations.at(-1).show(); await h.flush(); state.requests[0].resolve(fullView({ isPubliclyVisible: false })); await h.flush();
  assert.equal(h.result.metadataComplete, true, 'Ordinary owner routes retain existing hidden-project semantics.');
  state.path = '/share/creator'; h.update(); await h.flush(); assert.equal(h.result.metadataComplete, false);
  state.observations.at(-1).show(); await h.flush(); state.requests[1].reject(new Error('Connection interrupted')); await h.flush();
  assert.equal(h.result.error, 'Connection interrupted'); assert.equal(h.result.project, summary);
  h.result.retry(); await h.flush(); assert.equal(state.calls.length, 3); state.requests[2].resolve(fullView({ attachments: [] })); await h.flush();
  assert.equal(h.result.metadataComplete, true, 'An explicitly resolved empty project is truthfully one slide.'); h.unmount();
});
