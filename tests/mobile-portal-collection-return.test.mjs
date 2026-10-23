import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const { MobilePortalCollectionHistory } = sourceModule('src/presentation/mobile/useMobilePortalCollectionReturn.ts', {
  react: {}, 'react-router-dom': {},
});
const app = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
const visit = node => {
  if (ts.isFunctionDeclaration(node) && ['returnToPortalCollection', 'returnFromPortal'].includes(node.name?.text)) functions.set(node.name.text, node.getText(app));
  ts.forEachChild(node, visit);
};
visit(app);
const returns = ts.transpileModule([...functions.values()].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const category = '/p/creator/c/art';
const collection = { categoryPath: category, profilePath: '/p/creator', owner: true };

function harness({ mobile = true, owner = true, shared = false, initial = '/p/creator', index = 0, scope = 'owner:false', record = true } = {}) {
  const history = new MobilePortalCollectionHistory(), traversals = [], replacements = [];
  let sequence = 0, location, browser, current = index, identity = scope, delayed = false;
  const entries = Array.from({ length: index }, (_, i) => ({ path: `/unknown/${i}`, key: `unknown:${i}` }));
  const entry = value => { const parsed = new URL(value, 'https://portalink.test'); return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash }; };
  function commit(action = 'POP', shouldRecord = true) {
    const value = entries[current];
    location = { ...entry(value.path), key: value.key };
    browser = { ...entry(value.path), state: { idx: current, key: value.key } };
    if (shouldRecord) history.observe(identity, location, action, browser);
  }
  function push(value) {
    entries.splice(current + 1);
    entries.push({ path: value, key: `entry:${++sequence}` }); current++;
    commit('PUSH');
  }
  function replace(value) {
    replacements.push(value); entries[current] = { path: value, key: `entry:${++sequence}` }; commit('REPLACE');
  }
  function go(delta) {
    traversals.push(delta);
    if (delayed) return;
    assert.ok(Number.isInteger(delta) && current + delta >= 0 && current + delta < entries.length, 'Traversal stays in actual observed history');
    current += delta; commit('POP');
  }
  const buildPath = (name, values = {}) => name === 'home' ? '/' : name === 'portals' ? '/portals' :
    `${name.startsWith('shared') ? '/share' : '/p'}/${values.profileId}${name.endsWith('Category') ? `/c/${values.categoryId}` : ''}`;
  const context = { presentation: mobile ? 'mobile' : 'web', activeCategoryId: 'art', viewedProfileId: 'creator', isOwnerMode: owner, isSharedRoute: shared, buildPath,
    nav: { back: () => go(-1), to: (value, isReplacement) => isReplacement ? replace(value) : push(value) },
    returnToMobilePortalCollection: options => history.returnToCollection(identity, location, browser, options, go),
    window: { history: { get state() { return browser.state; } } },
  };
  vm.createContext(context); vm.runInContext(returns, context);
  entries.push({ path: initial, key: 'initial' }); commit('POP', record);
  return { history, entries, traversals, replacements, context, push, replace, go,
    get path() { return entries[current].path; }, get index() { return current; }, get location() { return location; }, get browser() { return browser; },
    close: () => context.returnToPortalCollection(), back: () => context.returnFromPortal(),
    switchScope(value) { identity = value; commit('POP'); },
    delay() { delayed = true; },
    native(value) { browser = value; },
    observe(action = 'POP') { history.observe(identity, location, action, browser); },
  };
}

test('MOBILE reader Back restores category, then chooser dismissal restores the original profile Portals entry without a duplicate alias', () => {
  const h = harness(); h.push('/p/creator?view=portals'); h.push(category); h.push(`${category}/pdf`);
  h.back(); assert.equal(h.path, category);
  h.close(); assert.equal(h.path, '/p/creator?view=portals');
  assert.deepEqual(h.traversals, [-1, -1]); assert.deepEqual(h.replacements, []);
  h.back(); assert.equal(h.path, '/p/creator');
  assert.deepEqual(h.traversals, [-1, -1, -1]);
  assert.equal(h.entries.some(entry => entry.path === '/portals'), false);
});

test('an owner who opens from /portals returns to that exact collection and its query', () => {
  const h = harness({ initial: '/portals?sort=recent' }); h.push(category); h.close();
  assert.equal(h.path, '/portals?sort=recent'); assert.deepEqual(h.traversals, [-1]); assert.deepEqual(h.replacements, []);
});

test('category query replacement and contiguous sort entries return with one bounded traversal', () => {
  const h = harness({ initial: '/p/creator?view=portals&layout=list#portals' });
  h.push(category); h.replace(`${category}?sort=title`); h.push(`${category}?sort=newest`); h.push(`${category}?layout=grid`);
  h.close(); assert.equal(h.path, '/p/creator?view=portals&layout=list#portals');
  assert.deepEqual(h.traversals, [-3]); assert.equal(h.replacements.length, 1, 'Only the actual sort replacement rewrites an entry');
});

test('browser Back and Forward keep the category and reader entries intact', () => {
  const h = harness({ initial: '/p/creator?view=portals' }); h.push(category); h.push(`${category}/pdf`);
  h.go(-1); h.close(); assert.equal(h.path, '/p/creator?view=portals');
  h.go(1); assert.equal(h.path, category); h.go(1); assert.equal(h.path, `${category}/pdf`);
  h.back(); h.close(); assert.equal(h.path, '/p/creator?view=portals');
  assert.deepEqual(h.replacements, []);
});

test('a new PUSH after Back discards old forward observations instead of trusting overwritten history', () => {
  const h = harness({ initial: '/p/creator?view=portals' }); h.push(category); h.push(`${category}/pdf`);
  h.go(-2); h.push('/messages'); h.push(category); h.close();
  assert.equal(h.path, '/portals'); assert.deepEqual(h.replacements, ['/portals']);
  assert.deepEqual(h.traversals, [-2]);
});

test('direct or reloaded category entries use owner and public fallbacks without guessing a predecessor', () => {
  for (const configuration of [{ owner: true, shared: false, initial: category, fallback: '/portals' },
    { owner: false, shared: false, initial: category, fallback: '/p/creator?view=portals' },
    { owner: false, shared: true, initial: '/share/creator/c/art', fallback: '/share/creator' }]) {
    const h = harness({ ...configuration, index: 8 }); h.close();
    assert.equal(h.path, configuration.fallback); assert.deepEqual(h.traversals, []);
    assert.deepEqual(h.replacements, [configuration.fallback]);
  }
});

test('the same-profile public opener is restored, while another profile or non-collection tab is not borrowed', () => {
  const shared = harness({ owner: false, shared: true, initial: '/share/creator?view=portals', scope: 'guest:true' });
  shared.push('/share/creator/c/art'); shared.close();
  assert.equal(shared.path, '/share/creator?view=portals'); assert.deepEqual(shared.traversals, [-1]);
  for (const initial of ['/p/other?view=portals', '/p/creator?view=followers', '/messages', '/portals']) {
    const h = harness({ owner: false, initial }); h.push(category); h.close();
    assert.equal(h.path, '/p/creator?view=portals'); assert.deepEqual(h.traversals, []);
  }
});

test('signout, account changes and WEB release all recorded Portal return ownership', () => {
  for (const next of [null, 'another-account:false', 'guest:false']) {
    const h = harness({ initial: '/p/creator?view=portals' }); h.push(category); h.switchScope(next); h.close();
    assert.equal(h.path, '/portals'); assert.deepEqual(h.traversals, []);
  }
  const web = harness({ mobile: false, initial: '/p/creator?view=portals' }); web.push(category); web.close();
  assert.equal(web.path, '/portals'); assert.deepEqual(web.traversals, []); assert.deepEqual(web.replacements, ['/portals']);
});

test('foreign/unobserved native state cannot justify traversal and an unfinished commit cannot consume another return', () => {
  const direct = harness({ initial: category, index: 4, record: false });
  direct.native({ ...direct.browser, state: { idx: 4, key: 'foreign' } }); direct.close();
  assert.equal(direct.path, '/portals'); assert.deepEqual(direct.traversals, []);
  const pending = harness({ initial: '/p/creator?view=portals' }); pending.push(category);
  pending.native({ pathname: `${category}/pdf`, search: '', hash: '', state: { idx: 2, key: 'not-yet-committed' } });
  pending.close(); assert.deepEqual(pending.traversals, []); assert.deepEqual(pending.replacements, []);
  pending.observe(); assert.equal(pending.history.returnToCollection('owner:false', pending.location, pending.browser, collection, delta => pending.traversals.push(delta)), true);
});

test('repeated dismissal before POP commits traverses only once', () => {
  const h = harness({ initial: '/p/creator?view=portals' }); h.push(category); h.delay(); h.close(); h.close();
  assert.deepEqual(h.traversals, [-1]); assert.deepEqual(h.replacements, []);
});

test('the bounded entry budget falls back rather than skipping an unobserved predecessor', () => {
  const h = harness({ initial: '/p/creator?view=portals' });
  for (let index = 0; index < 33; index++) h.push(`${category}?sort=${index}`);
  h.close(); assert.equal(h.path, '/portals'); assert.deepEqual(h.traversals, []);
});

test('existing direct-reader fallback remains owner Portals/public profile and WEB Back remains native', () => {
  for (const [owner, shared, fallback] of [[true, false, '/portals'], [false, false, '/p/creator'], [false, true, '/share/creator']]) {
    const h = harness({ owner, shared, initial: `${shared ? '/share' : '/p'}/creator/c/art/pdf` }); h.back();
    assert.equal(h.path, fallback); assert.deepEqual(h.traversals, []);
  }
  const web = harness({ mobile: false }); web.push(category); web.push(`${category}/pdf`); web.back();
  assert.equal(web.path, category); assert.deepEqual(web.traversals, [-1]); assert.deepEqual(web.replacements, []);
});

test('the real hook records only committed native entries and releases its history when MOBILE ownership ends', () => {
  let saved, pending, location, native, scope = 'owner:false';
  const navigations = [];
  const browser = { history: { get state() { return native; } }, location: { pathname: '/p/creator', search: '?view=portals', hash: '' } };
  const { useMobilePortalCollectionReturn } = sourceModule('src/presentation/mobile/useMobilePortalCollectionReturn.ts', {
    react: { useRef: value => saved ??= { current: value }, useLayoutEffect: effect => { pending = effect; } },
    'react-router-dom': { useNavigate: () => delta => navigations.push(delta) },
  }, { window: browser });
  function render(action, commit = true) {
    const close = useMobilePortalCollectionReturn(scope, location, action);
    if (commit) pending();
    return close;
  }
  location = { ...browser.location, key: 'default' }; native = { idx: 0 };
  render('POP');
  browser.location = { pathname: category, search: '', hash: '' }; native = { idx: 1, key: 'category' };
  const notCommitted = render('PUSH');
  assert.equal(notCommitted(collection), true); assert.deepEqual(navigations, [], 'An old React location cannot traverse native history already moving ahead');
  location = { ...browser.location, key: 'category' };
  const close = render('PUSH'); close(collection); close(collection);
  assert.deepEqual(navigations, [-1], 'The actual hook delegates one bounded traversal through useNavigate');
  scope = null; render('POP'); scope = 'owner:false';
  const resumed = render('POP'); assert.equal(resumed(collection), false, 'Returning from WEB does not reuse old MOBILE predecessors');
  assert.deepEqual(navigations, [-1]);
});
