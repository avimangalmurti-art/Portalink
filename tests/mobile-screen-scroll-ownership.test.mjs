import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production scroll effects with controlled lifecycle/RAF events.
// The remaining component services are irrelevant to document ownership.
function scrollSource(path, componentName) {
  const file = ts.createSourceFile(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
  assert.ok(component?.body);
  const statements = component.body.statements;
  const variable = name => {
    const declaration = statements.filter(ts.isVariableStatement).flatMap(node => Array.from(node.declarationList.declarations))
      .find(node => node.name.getText(file) === name);
    assert.ok(declaration, name);
    return 'const ' + declaration.getText(file) + ';';
  };
  const effect = marker => {
    const statement = statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
      && ['useEffect', 'useLayoutEffect'].includes(node.expression.expression.getText(file))
      && node.expression.arguments[0]?.getText(file).includes(marker));
    assert.ok(statement, marker);
    return statement.getText(file);
  };
  const shared = [variable('isMobile'), variable('screenActive')];
  return ts.transpileModule(componentName === 'HomeFeed'
    ? 'exports.render = () => {' + [...shared, variable('canOwnScroll'), effect('setScrollRestored(false)'),
      effect('let completed = false'), effect('writeFeedScroll(scrollMemoryKey, window.scrollY)'),
      variable('rememberScroll'), 'return rememberScroll;'].join('\n') + '};'
    : 'exports.render = () => {' + [...shared, variable('isMobileWall'), effect('wallMemoryRef.current?.read()')].join('\n') + '};',
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

const homeSource = scrollSource('src/components/home/HomeFeed.tsx', 'HomeFeed');
const profileSource = scrollSource('src/components/UserProfilePage.tsx', 'UserProfilePage');

function fixture(kind, { mobile = true, active = true, loading = false, maxScroll = Infinity } = {}) {
  const state = { mobile, active };
  const frames = new Map(), listeners = new Set(), slots = [], writes = [], saves = [], readiness = [], projectNotes = [], focusAttempts = [];
  let frameId = 0, cursor = 0, pending = [], documentTop = 900, containedTop = 0, target = 640;
  const scheduleEffect = (effect, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (previous && deps.length === previous.deps.length && deps.every((value, position) => Object.is(value, previous.deps[position]))) return;
    pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
  };
  const documentScroll = {
    get scrollTop() { return documentTop; },
    set scrollTop(value) { documentTop = Math.min(value, maxScroll); writes.push(['document', value]); },
  };
  const containedScroll = {
    get scrollTop() { return containedTop; },
    set scrollTop(value) { containedTop = value; writes.push(['contained', value]); },
    closest: () => false,
  };
  const context = {
    exports: {},
    usePresentation: () => state.mobile ? 'mobile' : 'web',
    useMobileScreenActive: () => state.active,
    useLayoutEffect: scheduleEffect, useEffect: scheduleEffect, useCallback: callback => callback,
    feed: { status: loading ? 'loading' : 'success' }, projects: loading ? [] : [{ id: 'work' }], layoutReady: true,
    hasRestoredScrollRef: { current: false }, latestScrollTopRef: { current: target }, persistFrameRef: { current: 0 },
    setScrollRestored: value => readiness.push(value), scrollMemoryKey: 'home',
    coldResume: { restoring: false, handled: false },
    writeFeedScroll: (key, value) => saves.push([key, value]),
    autoScrollRef: { current: containedScroll }, document: { scrollingElement: documentScroll },
    isJourney: false, activeView: 'projects', mobilePortalOverlay: null, nestedMobileContent: null, mobileProjectSelected: false,
    profile: { id: 'creator' }, profilePageRef: { current: { closest: () => !state.active } },
    noteMobileProfileProject: owner => projectNotes.push(owner),
    focusMobileProjectOrigin: (root, owner) => focusAttempts.push({ root, owner, scrollTop: documentTop }),
    mobileWallScroll: { current: { top: 0 } },
    wallMemoryRef: { current: { read: () => target, save: value => saves.push(['profile', value]) } },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    window: {
      get scrollY() { return documentTop; },
      scrollTo({ top }) { documentTop = top; writes.push(['document', top]); },
      addEventListener(name, callback) { assert.equal(name, 'scroll'); listeners.add(callback); },
      removeEventListener(name, callback) { assert.equal(name, 'scroll'); listeners.delete(callback); },
    },
  };
  vm.runInNewContext(kind === 'home' ? homeSource : profileSource, context);
  const render = changes => {
    Object.assign(state, changes);
    cursor = 0; pending = [];
    const handler = context.exports.render();
    pending.forEach(effect => effect());
    return handler;
  };
  return {
    state, context, writes, saves, readiness, frames, listeners, projectNotes, focusAttempts, render,
    paint() { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback()); },
    scroll(top) { documentTop = top; for (const callback of [...listeners]) callback(); },
    setTarget(top) { target = top; },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test('retained mobile Home cannot restore when its pending feed finishes in the background', () => {
  const h = fixture('home', { loading: true });
  h.render();
  assert.equal(h.frames.size, 0);
  h.render({ active: false });
  h.context.feed.status = 'success'; h.context.projects.push({ id: 'loaded' });
  h.render(); h.paint();
  assert.deepEqual(h.writes, []);
  assert.equal(h.listeners.size, 0);
  h.scroll(210);
  assert.equal(h.context.latestScrollTopRef.current, 640);
  h.render({ active: true }); h.paint();
  assert.deepEqual(h.writes, [['document', 640]]);
  assert.equal(h.readiness.at(-1), true);
  h.dispose();
});

test('leaving mobile Home cancels an in-flight restoration retry and resumes only when active', () => {
  const h = fixture('home', { maxScroll: 100 });
  h.render(); h.paint();
  assert.equal(h.frames.size, 1, 'The short loading layout still needs a later restore attempt.');
  h.render({ active: false });
  assert.equal(h.frames.size, 0);
  const count = h.writes.length;
  h.paint(); h.scroll(270);
  assert.equal(h.writes.length, count);
  assert.deepEqual(h.saves, []);
  h.render({ active: true }); h.paint();
  assert.equal(h.writes.length, count + 1);
  h.dispose(); assert.equal(h.frames.size, 0);
});

test('active mobile Home records its own position and inactive scroll handlers cannot overwrite it', () => {
  const h = fixture('home');
  h.render(); h.paint(); h.scroll(780);
  assert.deepEqual(h.saves, [['home', 780]]);
  const inactiveHandler = h.render({ active: false });
  h.scroll(120);
  inactiveHandler({ currentTarget: { scrollTop: 0 } }); h.paint();
  assert.equal(h.context.latestScrollTopRef.current, 780);
  assert.deepEqual(h.saves, [['home', 780]]);
  h.render({ active: true });
  assert.equal(h.frames.size, 0, 'A completed restore leaves retained-screen restoration in charge.');
  h.scroll(790);
  assert.deepEqual(h.saves.at(-1), ['home', 790]);
  h.dispose(); assert.equal(h.listeners.size, 0);
});

test('WEB Home keeps contained restoration and recording regardless of mobile screen activity', () => {
  const h = fixture('home', { mobile: false, active: false });
  const handler = h.render(); h.paint();
  assert.deepEqual(h.writes, [['contained', 640]]);
  assert.equal(h.listeners.size, 0);
  handler({ currentTarget: { scrollTop: 350 } }); h.paint();
  assert.deepEqual(h.saves, [['home', 350]]);
  h.render({ active: true });
  assert.equal(h.frames.size, 0);
  h.dispose();
});

test('inactive mobile profile walls cannot restore or remember the active route document', () => {
  const h = fixture('profile', { active: false });
  h.render(); h.paint(); h.scroll(240);
  assert.deepEqual(h.writes, []); assert.deepEqual(h.saves, []);
  assert.equal(h.listeners.size, 0);
  h.render({ active: true }); h.paint();
  assert.deepEqual(h.writes, [['document', 640]]);
  h.scroll(720); assert.deepEqual(h.saves, [['profile', 720]]);
  h.render({ active: false }); h.scroll(90);
  assert.deepEqual(h.saves, [['profile', 720]]);
  h.setTarget(720); h.render({ active: true }); h.paint();
  assert.deepEqual(h.writes.at(-1), ['document', 720]);
  h.dispose(); assert.equal(h.listeners.size, 0);
});

test('leaving a profile before its restore frame cancels that frame', () => {
  const h = fixture('profile');
  h.render(); assert.equal(h.frames.size, 1);
  const queuedFrame = [...h.frames.values()][0];
  h.render({ active: false }); h.paint();
  queuedFrame(); // A callback already selected before passive-effect cleanup.
  assert.equal(h.frames.size, 0); assert.deepEqual(h.writes, []);
  h.dispose();
});

test('WEB profiles and mobile nested project views never run the wall document effects', () => {
  const web = fixture('profile', { mobile: false });
  web.render(); web.paint(); assert.equal(web.listeners.size, 0); assert.deepEqual(web.writes, []);
  const reader = fixture('profile'); reader.context.nestedMobileContent = {};
  reader.render(); reader.paint(); assert.equal(reader.listeners.size, 0); assert.deepEqual(reader.writes, []);
  assert.deepEqual(web.projectNotes, []); assert.deepEqual(web.focusAttempts, []); assert.deepEqual(reader.projectNotes, []); assert.deepEqual(reader.focusAttempts, []);
  web.dispose(); reader.dispose();
});

test('a committed active MOBILE reader confirms its owner before the wall guard and return focus follows scroll restoration', () => {
  const h = fixture('profile'); h.context.nestedMobileContent = {}; h.context.mobileProjectSelected = true;
  h.render(); h.paint();
  assert.deepEqual(h.projectNotes, ['creator']); assert.deepEqual(h.focusAttempts, []); assert.deepEqual(h.writes, []); assert.equal(h.listeners.size, 0);
  h.render({ active: false });
  h.context.nestedMobileContent = null; h.context.mobileProjectSelected = false; h.render(); h.paint();
  assert.deepEqual(h.projectNotes, ['creator']); assert.deepEqual(h.focusAttempts, []); assert.deepEqual(h.writes, [], 'An inactive returning catalogue cannot take document ownership early.');
  h.setTarget(720); h.render({ active: true }); assert.equal(h.focusAttempts.length, 0); h.paint();
  assert.deepEqual(h.writes, [['document', 720]]); assert.equal(h.focusAttempts.length, 1);
  assert.equal(h.focusAttempts[0].root, h.context.profilePageRef.current); assert.equal(h.focusAttempts[0].owner, 'creator'); assert.equal(h.focusAttempts[0].scrollTop, 720, 'Existing return positioning runs before focus is requested.');
  h.dispose();
});

test('WEB and inactive MOBILE readers cannot confirm a return-focus origin', () => {
  for (const options of [{ mobile: false, active: true }, { mobile: true, active: false }]) {
    const h = fixture('profile', options); h.context.nestedMobileContent = {}; h.context.mobileProjectSelected = true;
    h.render(); h.paint(); assert.deepEqual(h.projectNotes, []); assert.deepEqual(h.focusAttempts, []); assert.deepEqual(h.writes, []); h.dispose();
  }
});
