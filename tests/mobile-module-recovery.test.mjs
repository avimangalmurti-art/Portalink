import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const downloadError = () => new TypeError('Failed to fetch dynamically imported module: https://portalink.test/assets/screen.js');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function events(extra = {}) {
  const handlers = new Map();
  return { ...extra,
    addEventListener(type, callback) { const group = handlers.get(type) ?? new Set(); group.add(callback); handlers.set(type, group); },
    removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
    emit(type) { for (const callback of [...handlers.get(type) ?? []]) callback({ type }); },
    count(type) { return handlers.get(type)?.size ?? 0; },
  };
}

/** Real production class, real React.lazy promises, controlled browser lifecycle. */
function fixture({ mobile = true, active = true, phase = 'authenticated', loader, styles } = {}) {
  const document = events({ visibilityState: 'visible' });
  const navigator = { onLine: true };
  const window = events({ location: { pathname: '/', search: '', hash: '' } });
  const session = {};
  const env = { mobile, active, auth: { phase, user: phase === 'unauthenticated' ? null : { id: 'account-a' }, loginSession: session, pendingView: null, session: null }, owner: { active: true, onClose() {} } };
  const calls = [], repairs = [];
  const read = () => { calls.push(calls.length + 1); return loader?.(calls.length) ?? Promise.resolve({ default: () => null }); };
  const Status = () => null;
  const { lazyWithMobileRecovery } = sourceModule('src/components/ui/lazyWithMobileRecovery.tsx', {
    react: { ...React, useContext: () => env.owner },
    '../../contexts/AuthContext': { useAuth: () => env.auth },
    '../../presentation/usePresentation': { usePresentation: () => env.mobile ? 'mobile' : 'web' },
    '../../presentation/mobile/MobileBackNavigation': { useMobileScreenActive: () => env.active },
    './DeferredDialog': { DeferredSurfaceStatus: Status },
    './DeferredSurfaceOwner': { DeferredSurfaceOwnerContext: {} },
    './moduleLoadRecovery': {
      isModuleDownloadFailure: error => error?.message?.startsWith('Failed to fetch dynamically imported module:') === true,
      recoverModuleStyles(error, signal) { repairs.push({ error, signal }); return styles?.(error, signal) ?? Promise.resolve(); },
    },
  }, { document, window, navigator, AbortController });
  const Component = lazyWithMobileRecovery(read);
  const wrappers = [];
  function instance(props = { value: 'draft stays here' }, component = Component) {
    const element = component(props);
    const boundary = new element.type(element.props);
    let mounted = true;
    boundary.setState = patch => {
      if (!mounted) throw new Error('State written after unmount');
      const previous = boundary.props;
      boundary.state = { ...boundary.state, ...(typeof patch === 'function' ? patch(boundary.state, previous) : patch) };
      boundary.componentDidUpdate(previous);
    };
    boundary.componentDidMount();
    const wrapper = {
      boundary,
      render: () => boundary.render(),
      update() { const previous = boundary.props; boundary.props = component(props).props; boundary.componentDidUpdate(previous); },
      async failInitial() {
        const child = boundary.render().type;
        let pending;
        try { child._init(child._payload); } catch (value) { pending = value; }
        assert.equal(typeof pending?.then, 'function', 'The real lazy importer suspends');
        await pending.catch(() => {});
        let failure;
        try { child._init(child._payload); } catch (value) { failure = value; }
        boundary.state = { ...boundary.state, ...element.type.getDerivedStateFromError(failure) };
        boundary.componentDidUpdate(boundary.props);
        return failure;
      },
      async resolved() {
        const child = boundary.render().type;
        if (typeof child._init !== 'function') return child;
        try { return child._init(child._payload); } catch (pending) { await pending; return child._init(child._payload); }
      },
      dispose() { boundary.componentWillUnmount(); mounted = false; },
    };
    wrappers.push(wrapper);
    return wrapper;
  }
  return { env, document, navigator, window, calls, repairs, Status, instance, newFactory: () => lazyWithMobileRecovery(read),
    offline() { navigator.onLine = false; window.emit('offline'); },
    online() { navigator.onLine = true; window.emit('online'); },
    hidden() { document.visibilityState = 'hidden'; document.emit('visibilitychange'); },
    visible() { document.visibilityState = 'visible'; document.emit('visibilitychange'); },
    update() { for (const wrapper of wrappers) wrapper.update(); },
    dispose() { for (const wrapper of wrappers) wrapper.dispose(); },
  };
}

test('a rejected screen import recovers locally on reconnection without a document reload', async () => {
  const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }) });
  const screen = f.instance(); await screen.failInitial();
  assert.equal(screen.render().type, f.Status);
  f.offline(); f.online(); await tick();
  assert.equal(await screen.resolved(), Screen); assert.equal(f.calls.length, 2); assert.equal(f.repairs.length, 1);
  assert.equal(screen.render().props.value, 'draft stays here'); f.dispose();
});

test('discarding initially suspended classes reuses one pending/rejected lazy type instead of an importer render loop', async () => {
  const pending = deferred(); const failure = downloadError(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? pending.promise : Promise.resolve({ default: Screen }) });
  const first = f.instance(); const initial = first.render().type;
  let suspension;
  try { initial._init(initial._payload); } catch (value) { suspension = value; }
  assert.equal(typeof suspension?.then, 'function'); first.dispose();
  const stillPending = f.instance(); assert.equal(stillPending.render().type, initial);
  assert.throws(() => initial._init(initial._payload), error => error === suspension); stillPending.dispose();
  pending.reject(failure); await suspension.catch(() => {});
  let last;
  for (let i = 0; i < 12; i++) {
    const replacement = f.instance(); assert.equal(replacement.render().type, initial);
    let owned;
    try { initial._init(initial._payload); } catch (value) { owned = value; }
    assert.equal(owned.original, failure);
    replacement.boundary.state = { ...replacement.boundary.state, ...replacement.boundary.constructor.getDerivedStateFromError(owned) };
    assert.equal(replacement.render().type, f.Status);
    assert.equal(f.calls.length, 1, 'Suspense reconstruction is never an import-retry event');
    if (i < 11) replacement.dispose(); else last = replacement;
  }
  f.offline(); f.online(); await tick(); assert.equal(last.render().type, Screen); assert.equal(f.calls.length, 2); last.dispose();
});

test('duplicate online/visible notifications grant one attempt and persistent failure does not loop', async () => {
  const f = fixture({ loader: () => Promise.reject(downloadError()) });
  const screen = f.instance(); await screen.failInitial();
  f.offline(); f.hidden(); f.online(); f.visible(); f.window.emit('online'); f.document.emit('visibilitychange'); await tick();
  assert.equal(f.calls.length, 2); assert.equal(screen.render().type, f.Status);
  f.window.emit('online'); f.visible(); await tick(); assert.equal(f.calls.length, 2);
  f.hidden(); f.visible(); await tick(); assert.equal(f.calls.length, 3, 'A genuinely later foreground permits one more try'); f.dispose();
});

test('an already-online failure waits for a genuine lifecycle change instead of retrying on render', async () => {
  const f = fixture({ loader: () => Promise.reject(downloadError()) });
  const screen = f.instance(); await screen.failInitial(); f.update(); f.window.emit('online'); f.visible(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.repairs.length, 0); f.dispose();
});

test('a lifecycle grant received during a pending importer is consumed once after its delayed rejection', async () => {
  const pending = deferred(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? pending.promise : Promise.resolve({ default: Screen }) });
  const screen = f.instance(); const failing = screen.failInitial(); f.offline(); f.online(); await tick();
  assert.equal(f.calls.length, 1); pending.reject(downloadError()); await failing; await tick();
  assert.equal(f.calls.length, 2); assert.equal(await screen.resolved(), Screen); f.dispose();
});

test('a new reconnect during a busy attempt is deferred and coalesced until that attempt fails', async () => {
  const pending = deferred();
  const f = fixture({ loader: count => count === 2 ? pending.promise : Promise.reject(downloadError()) });
  const screen = f.instance(); await screen.failInitial();
  f.offline(); f.online(); await tick(); assert.equal(f.calls.length, 2);
  f.offline(); f.online(); f.window.emit('online'); await tick(); assert.equal(f.calls.length, 2);
  pending.reject(downloadError()); await tick(); assert.equal(f.calls.length, 3);
  await tick(); assert.equal(f.calls.length, 3); f.dispose();
});

test('CSS repair must finish successfully before the original importer is retried', async () => {
  const css = deferred(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }), styles: () => css.promise });
  const screen = f.instance(); await screen.failInitial(); f.hidden(); f.visible(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(screen.render().type, f.Status);
  css.resolve(); await tick(); assert.equal(f.calls.length, 2); assert.equal(await screen.resolved(), Screen); f.dispose();
});

test('hide and return while CSS is pending retains one waiter and consumes no duplicate repair or import', async () => {
  const css = deferred(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }), styles: () => css.promise });
  const screen = f.instance(); await screen.failInitial(); f.offline(); f.online(); await tick();
  f.hidden(); assert.equal(f.repairs[0].signal.aborted, false); f.visible(); await tick();
  assert.equal(f.repairs.length, 1); assert.equal(f.calls.length, 1);
  css.resolve(); await tick(); assert.equal(screen.render().type, Screen); assert.equal(f.repairs.length, 1); assert.equal(f.calls.length, 2); f.dispose();
});

test('CSS completion while hidden cannot mount content or start the recovered importer until foreground', async () => {
  const css = deferred(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }), styles: () => css.promise });
  const screen = f.instance(); await screen.failInitial(); f.hidden(); f.visible(); await tick(); f.hidden();
  css.resolve(); await tick(); assert.equal(screen.boundary.state.recovered, null); assert.equal(f.calls.length, 1);
  f.visible(); await tick(); assert.equal(screen.render().type, Screen); assert.equal(f.calls.length, 2); f.dispose();
});

test('persistent stylesheet failure leaves the current fallback and never attempts incomplete screen code', async () => {
  const f = fixture({ loader: () => Promise.reject(downloadError()), styles: () => Promise.reject(new Error('The screen stylesheet could not be recovered.')) });
  const screen = f.instance(); await screen.failInitial(); f.offline(); f.online(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(screen.render().type, f.Status); await tick(); assert.equal(f.repairs.length, 1); f.dispose();
});

for (const reason of ['closed', 'retained', 'account', 'session', 'phase', 'web', 'unmounted']) {
  test(`${reason} invalidates a pending recovery before it can open stale content`, async () => {
    const pending = deferred(); const Screen = () => null;
    const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : pending.promise });
    const screen = f.instance(); await screen.failInitial(); f.offline(); f.online(); await tick();
    assert.equal(f.calls.length, 2); const controller = f.repairs[0].signal;
    if (reason === 'closed') f.env.owner.active = false;
    if (reason === 'retained') f.env.active = false;
    if (reason === 'account') f.env.auth.user = { id: 'account-b' };
    if (reason === 'session') f.env.auth.loginSession = {};
    if (reason === 'phase') f.env.auth.phase = 'signing-out';
    if (reason === 'web') f.env.mobile = false;
    if (reason === 'unmounted') screen.dispose(); else f.update();
    assert.equal(controller.aborted, true); pending.resolve({ default: Screen }); await tick();
    assert.equal(screen.boundary.state.recovered, null);
    if (reason !== 'unmounted') f.dispose();
  });
}

test('hidden recovery completion waits for a real foreground and cannot commit in the background', async () => {
  const pending = deferred(); const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : pending.promise });
  const screen = f.instance(); await screen.failInitial(); f.offline(); f.online(); await tick(); f.hidden();
  pending.resolve({ default: Screen }); await tick(); assert.equal(screen.boundary.state.recovered, null);
  f.visible(); await tick(); assert.equal(await screen.resolved(), Screen); assert.equal(f.calls.length, 3); f.dispose();
});

for (const returnTo of ['retained screen', 'reopened dialog']) {
  test(`${returnTo} retries once after an inactive reconnection, without touching healthy modules`, async () => {
    const Screen = () => null;
    const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }) });
    const screen = f.instance(); await screen.failInitial();
    if (returnTo === 'retained screen') f.env.active = false; else f.env.owner.active = false;
    f.update(); f.offline(); f.online(); await tick(); assert.equal(f.calls.length, 1);
    f.env.active = true; f.env.owner.active = true; f.update(); await tick(); assert.equal(await screen.resolved(), Screen); assert.equal(f.calls.length, 2);
    f.env.active = false; f.update(); f.env.active = true; f.update(); await tick(); assert.equal(f.calls.length, 2); f.dispose();
  });
}

test('presentation or account replacement alone is never a failed-screen return grant', async () => {
  const f = fixture({ loader: () => Promise.reject(downloadError()) });
  const screen = f.instance(); await screen.failInitial();
  f.env.mobile = false; f.update(); f.env.mobile = true; f.update(); await tick(); assert.equal(f.calls.length, 1);
  f.env.active = false; f.update(); f.env.auth.user = { id: 'account-b' }; f.env.auth.loginSession = {}; f.env.active = true; f.update(); await tick();
  assert.equal(f.calls.length, 1); f.dispose();
});

test('stable guest browsing is eligible, but authentication and recovery destinations never retry', async () => {
  for (const guard of ['guest', 'initializing', 'authenticating', 'failed', 'signing-out', 'pending', 'recovery', 'callback']) {
    const f = fixture({ phase: guard === 'guest' ? 'unauthenticated' : 'authenticated', loader: () => Promise.reject(downloadError()) });
    if (['initializing', 'authenticating', 'failed', 'signing-out'].includes(guard)) f.env.auth.phase = guard;
    if (guard === 'pending') f.env.auth.pendingView = 'signIn';
    if (guard === 'recovery') f.env.auth.session = { isPasswordRecovery: true };
    if (guard === 'callback') f.window.location.search = '?code=sensitive';
    const screen = f.instance(); await screen.failInitial(); f.offline(); f.online(); await tick();
    assert.equal(f.calls.length, guard === 'guest' ? 2 : 1, guard); f.dispose();
  }
});

test('WEB keeps the original lazy error and does not gain mobile retry behavior', async () => {
  const failure = downloadError();
  const f = fixture({ mobile: false, loader: () => Promise.reject(failure) });
  const screen = f.instance(); await screen.failInitial(); assert.throws(() => screen.render(), error => error === failure);
  f.offline(); f.online(); f.hidden(); f.visible(); await tick(); assert.equal(f.calls.length, 1); f.dispose();
});

test('ordinary render errors and another module owner cannot trigger this importer', async () => {
  const runtimeFailure = new Error('Project render failed');
  const f = fixture({ loader: () => Promise.reject(downloadError()) });
  const first = f.instance(), other = f.instance(undefined, f.newFactory());
  assert.throws(() => first.boundary.constructor.getDerivedStateFromError(runtimeFailure), error => error === runtimeFailure);
  const ownedElsewhere = await first.failInitial();
  other.boundary.state = { ...other.boundary.state, ...other.boundary.constructor.getDerivedStateFromError(ownedElsewhere) };
  assert.throws(() => other.render(), error => error === ownedElsewhere);
  // No local replay can repair a foreign child's importer.
  first.dispose(); other.boundary.componentDidUpdate(other.boundary.props); f.offline(); f.online(); await tick(); assert.equal(f.calls.length, 1); other.dispose();
});

test('a non-download error during the recovery importer propagates to the existing outer boundary', async () => {
  const runtimeFailure = new SyntaxError('Invalid exported screen module');
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.reject(runtimeFailure) });
  const screen = f.instance(); await screen.failInitial(); f.hidden(); f.visible(); await tick();
  assert.throws(() => screen.render(), error => error === runtimeFailure); assert.equal(f.calls.length, 2); f.dispose();
});

test('healthy mounted identities survive lifecycle events, presentation changes and a second instance recovery', async () => {
  const Screen = () => null;
  const f = fixture({ loader: count => count === 2 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }) });
  const healthy = f.instance(); const original = healthy.render().type; const resolving = healthy.resolved();
  const failing = f.instance(undefined, f.newFactory()); const failingInitial = failing.failInitial();
  assert.equal(await resolving, Screen); await failingInitial; f.offline(); f.online(); await tick(); assert.equal(await failing.resolved(), Screen);
  assert.equal(failing.render().type, Screen, 'Already loaded recovery code cannot suspend the healthy outer screen again');
  assert.equal(healthy.render().type, original); f.env.mobile = false; f.update(); assert.equal(healthy.render().type, original);
  assert.equal(f.window.count('online'), 0, 'WEB has no mobile lifecycle listeners');
  f.env.mobile = true; f.update(); f.hidden(); f.visible(); await tick(); assert.equal(healthy.render().type, original); assert.equal(f.calls.length, 3); f.dispose();
});

test('a new instance after a healthy module fulfillment reads no loader and cannot suspend, including WEB', async () => {
  const Screen = () => null;
  const f = fixture({ mobile: false, loader: () => Promise.resolve({ default: Screen }) });
  const first = f.instance(); assert.equal(await first.resolved(), Screen); first.dispose();
  const second = f.instance(); assert.equal(second.render().type, Screen); assert.equal(f.calls.length, 1); second.dispose();
});

test('a new instance after recovery uses fulfilled code while existing instances keep their type', async () => {
  const Screen = () => null;
  const f = fixture({ loader: count => count === 1 ? Promise.reject(downloadError()) : Promise.resolve({ default: Screen }) });
  const first = f.instance(); await first.failInitial(); f.offline(); f.online(); await tick(); assert.equal(first.render().type, Screen);
  const second = f.instance(); assert.equal(second.render().type, Screen); assert.equal(f.calls.length, 2); f.dispose();
});

test('close delegates to the owning surface and disposal removes all lifecycle listeners', async () => {
  let closed = 0;
  const f = fixture({ loader: () => Promise.reject(downloadError()) }); f.env.owner.onClose = () => { closed += 1; };
  const screen = f.instance(); await screen.failInitial(); screen.render().props.onClose(); assert.equal(closed, 1);
  f.dispose(); assert.equal(f.window.count('offline'), 0); assert.equal(f.window.count('online'), 0); assert.equal(f.document.count('visibilitychange'), 0);
});
