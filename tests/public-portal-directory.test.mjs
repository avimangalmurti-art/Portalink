import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const { normalizePublicAppearance } = sourceModule('src/utils/publicAppearance.ts', {
  './appearancePreferences': { resolveAppearance: () => 'light' },
});
const parse = path => ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function serviceDeclaration(tree, name) {
  return tree.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
    .find(node => node.name.getText(tree) === name);
}
function portalRow(index = 0) {
  return {
    id: `portal-${String(index).padStart(3, '0')}`, profile_id: 'creator', label: `Portal ${String(index).padStart(3, '0')}`, icon_name: 'FolderIcon',
    profiles: { id: 'creator', name: 'Creator', handle: 'creator', avatar_url: '/avatar.png' },
  };
}
function productionFixture({ user = { id: 'account', is_anonymous: false }, authError = null, authThrown = null, rows = [], queryError = null } = {}) {
  const calls = [];
  let range = [0, 48];
  const request = {
    select(value) { calls.push(['select', value]); return request; },
    eq(...args) { calls.push(['eq', ...args]); return request; },
    ilike(...args) { calls.push(['ilike', ...args]); return request; },
    order(...args) { calls.push(['order', ...args]); return request; },
    range(...args) { range = args; calls.push(['range', ...args]); return request; },
    then(resolve, reject) { return Promise.resolve({ data: rows?.slice(range[0], range[1] + 1) ?? null, error: queryError }).then(resolve, reject); },
  };
  const client = {
    auth: { async getUser() { calls.push('getUser'); if (authThrown) throw authThrown; return { data: { user }, error: authError }; } },
    from(table) { calls.push(['from', table]); assert.equal(table, 'portfolio_categories', 'Directory must not hydrate projects or media'); return request; },
  };
  const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', { './client': { requireSupabase: () => client } });
  const service = sourceModule('src/services/supabase/publicPortalDirectory.ts', {
    './client': { requireSupabase: () => client }, './requireDirectoryAccount': { requireDirectoryAccount },
    '../../utils/publicAppearance': { normalizePublicAppearance },
  });
  return { ...service, calls };
}

test('public portal directory denies signed-out, anonymous and failed identities before any read', async () => {
  for (const identity of [
    { user: null },
    { user: { id: 'anonymous', is_anonymous: true } },
    { authError: { message: 'Identity unavailable' } },
    { authThrown: new Error('Identity request failed') },
  ]) {
    const h = productionFixture(identity);
    await assert.rejects(h.listPublicPortals(), /account or sign in|Identity request failed/);
    assert.deepEqual(h.calls, ['getUser']);
  }
});

test('public portal directory authenticates first and selects only public portal and creator identities', async () => {
  const row = portalRow();
  Object.defineProperty(row, 'projects', { get() { assert.fail('Empty portals must not require project hydration'); } });
  const h = productionFixture({ rows: [row] });
  assert.deepEqual(plain(await h.listPublicPortals()), {
    items: [{ id: row.id, profileId: 'creator', label: row.label, iconName: 'FolderIcon', creator: { id: 'creator', name: 'Creator', handle: 'creator', avatar: '/avatar.png' } }], nextOffset: null,
  });
  assert.deepEqual(h.calls, [
    'getUser', ['from', 'portfolio_categories'], ['select', 'id,profile_id,label,icon_name,profiles!inner(id,name,handle,avatar_url,public_appearance)'],
    ['eq', 'is_hidden', false], ['eq', 'profiles.is_private', false], ['order', 'label'], ['order', 'id'], ['range', 0, 48],
  ]);
});

test('each public portal keeps its creator exact saved accent without exposing other appearance fields', async () => {
  const rows = ['#FfCC00', '#A032ef'].map((accentColor, index) => {
    const row = portalRow(index), id = `creator-${index}`;
    return { ...row, profile_id: id, profiles: { ...row.profiles, id, public_appearance: { accentColor, systemGray: 'gray4', mode: 'dark' } } };
  });
  const { items } = await productionFixture({ rows }).listPublicPortals();
  assert.deepEqual(plain(items.map(item => [item.profileId, item.creator.accentColor])), [['creator-0', '#FfCC00'], ['creator-1', '#A032ef']]);
  for (const item of items) {
    assert.deepEqual(Object.keys(item.creator).sort(), ['accentColor', 'avatar', 'handle', 'id', 'name']);
    assert.equal(item.creator.publicAppearance, undefined, 'The directory returns only the needed identity color, not a theme for the viewer');
  }
});

const invalidPublicBranding = [
  undefined, null, {}, [], 'pink',
  { accentColor: '#abc', systemGray: 'gray6', mode: 'auto' },
  { accentColor: '#FF375F' },
  { accentColor: 'var(--accent-primary)', systemGray: 'gray6', mode: 'auto' },
  { accentColor: 'url(https://untrusted.example/pixel)', systemGray: 'gray6', mode: 'auto' },
  { accentColor: '#FF375F; background:red', systemGray: 'gray6', mode: 'auto' },
  { accentColor: '#FF375F', systemGray: 'unexpected-gray', mode: 'auto' },
  { accentColor: '#FF375F', systemGray: 'gray6', mode: 'unexpected-mode' },
];

test('missing, malformed and CSS-like public branding stays undefined rather than inventing a creator accent', async () => {
  for (const public_appearance of invalidPublicBranding) {
    const row = portalRow();
    row.profiles.public_appearance = public_appearance;
    const { items } = await productionFixture({ rows: [row] }).listPublicPortals();
    assert.equal(items[0].creator.accentColor, undefined);
    assert.deepEqual(plain(items[0].creator), { id: 'creator', name: 'Creator', handle: 'creator', avatar: '/avatar.png' });
  }
});

test('blank directory searches retain empty public portals and omit the optional icon', async () => {
  const h = productionFixture({ rows: [{ ...portalRow(), icon_name: null }] });
  const result = await h.listPublicPortals('   ');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].iconName, undefined);
  assert.equal(h.calls.some(call => call[0] === 'ilike'), false);
});

test('portal name search trims, bounds and escapes SQL wildcards as literal text', async () => {
  for (const [query, expected] of [
    ['  Design  ', '%Design%'], ['50%', '%50\\%%'], ['a_b', '%a\\_b%'], ['a\\b', '%a\\\\b%'],
    ['  %_\\  ', '%\\%\\_\\\\%'], ['x'.repeat(90), `%${'x'.repeat(80)}%`], ['a,b"(c)', '%a,b"(c)%'],
  ]) {
    const h = productionFixture();
    await h.listPublicPortals(query);
    assert.deepEqual(h.calls.find(call => call[0] === 'ilike'), ['ilike', 'label', expected]);
  }
});

test('49 portal rows return a 48-item page and a sentinel-based next offset', async () => {
  const h = productionFixture({ rows: Array.from({ length: 49 }, (_, index) => portalRow(index)) });
  const first = await h.listPublicPortals();
  assert.equal(first.items.length, 48);
  assert.equal(first.items.at(-1).id, 'portal-047');
  assert.equal(first.nextOffset, 48);
  const last = await h.listPublicPortals('', first.nextOffset);
  assert.deepEqual(plain(last.items.map(item => item.id)), ['portal-048']);
  assert.equal(last.nextOffset, null);
  assert.deepEqual(h.calls.filter(call => call[0] === 'range'), [['range', 0, 48], ['range', 48, 96]]);
});

test('exactly 48 rows and an exhausted page do not advertise another page', async () => {
  const h = productionFixture({ rows: Array.from({ length: 48 }, (_, index) => portalRow(index)) });
  const full = await h.listPublicPortals();
  assert.equal(full.items.length, 48);
  assert.equal(full.nextOffset, null);
  assert.deepEqual(plain(await h.listPublicPortals('', 48)), { items: [], nextOffset: null });
});

test('portal directory bounds malformed and extreme offsets without an unsafe range end', async () => {
  for (const [offset, start] of [[-5, 0], [1.9, 1], [NaN, 0], [Infinity, 0], [-Infinity, 0], [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER - 48], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 48]]) {
    const h = productionFixture();
    await h.listPublicPortals('', offset);
    assert.deepEqual(h.calls.find(call => call[0] === 'range'), ['range', start, start + 48]);
    assert.ok(Number.isSafeInteger(start + 48));
  }
});

test('directory failures reject rather than returning partial data or backend details', async () => {
  const h = productionFixture({ rows: [portalRow()], queryError: { message: 'private backend detail' } });
  await assert.rejects(h.listPublicPortals(), error => error.message === 'Portals could not be loaded. Please try again.');
  assert.deepEqual(plain(await productionFixture({ rows: null }).listPublicPortals()), { items: [], nextOffset: null });
});

const mockTree = parse('src/services/mocks/index.ts');
const mockMethod = serviceDeclaration(mockTree, 'mockDiscoveryService').initializer.properties.find(node => node.name?.getText(mockTree) === 'listPublicPortals');
function mockFixture({ profiles = [], session = { user: { id: 'account' } }, arrangements = new Map() } = {}) {
  assert.ok(mockMethod, 'Mock discovery must implement the mandatory directory contract');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.service = {${mockMethod.getText(mockTree)}}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, profiles, savedArrangements: arrangements, readPrototypeSession: () => session, resolve: value => Promise.resolve(value), normalizePublicAppearance });
  return exports.service;
}
function prototypeProfile({ id = 'creator', isPrivate = false, categories = [] } = {}) {
  const profile = { id, name: 'Creator', handle: id, avatar: '/avatar.png', isPrivate, categories };
  Object.defineProperty(profile, 'projects', { get() { assert.fail('Portal identities must not read project or media data'); } });
  return profile;
}

test('prototype portal directory refuses a missing session before examining content', async () => {
  const profiles = new Proxy([], { get() { assert.fail('Signed-out mock must not inspect profiles'); } });
  await assert.rejects(mockFixture({ profiles, session: null }).listPublicPortals(), /account or sign in/);
});

test('prototype directory excludes private profiles and hidden categories while retaining empty portals', async () => {
  const profiles = [
    prototypeProfile({ categories: [{ id: 'visible', label: 'Empty', iconName: 'FolderIcon' }, { id: 'hidden', label: 'Hidden', iconName: 'EyeIcon' }] }),
    prototypeProfile({ id: 'private', isPrivate: true, categories: [{ id: 'private-portal', label: 'Private' }] }),
  ];
  const h = mockFixture({ profiles, session: { user: { id: 'owner', profileId: 'private' } }, arrangements: new Map([['creator', { hiddenCategoryIds: ['hidden'] }]]) });
  assert.deepEqual(plain(await h.listPublicPortals()), {
    items: [{ id: 'visible', profileId: 'creator', label: 'Empty', iconName: 'FolderIcon', creator: { id: 'creator', name: 'Creator', handle: 'creator', avatar: '/avatar.png' } }], nextOffset: null,
  });
});

test('prototype and production portal directories share exact valid colors and neutral invalid-branding fallbacks', async () => {
  const appearances = [
    { accentColor: '#FfCC00', systemGray: 'gray4', mode: 'dark' },
    { accentColor: '#A032ef', systemGray: 'gray6', mode: 'auto' },
    ...invalidPublicBranding,
  ];
  const rows = appearances.map((public_appearance, index) => {
    const row = portalRow(index), id = `creator-${index}`;
    return { ...row, profile_id: id, profiles: { ...row.profiles, id, name: `Creator ${index}`, handle: id, public_appearance } };
  });
  const profiles = rows.map(row => Object.assign(prototypeProfile({ id: row.profile_id, categories: [{ id: row.id, label: row.label, iconName: row.icon_name }] }), {
    name: row.profiles.name, publicAppearance: row.profiles.public_appearance,
  }));
  const production = await productionFixture({ rows }).listPublicPortals();
  const prototype = await mockFixture({ profiles }).listPublicPortals();
  assert.deepEqual(plain(prototype), plain(production));
  assert.deepEqual(plain(prototype.items.slice(0, 2).map(item => item.creator.accentColor)), ['#FfCC00', '#A032ef']);
  assert.ok(prototype.items.slice(2).every(item => item.creator.accentColor === undefined));
});

test('prototype portal name search is case-insensitive, literal and bounded to 80 characters', async () => {
  const labels = ['Design', '50%', 'a_b', 'a\\b', 'anything', 'x'.repeat(80)];
  const h = mockFixture({ profiles: [prototypeProfile({ categories: labels.map((label, index) => ({ id: String(index), label })) })] });
  for (const [query, expected] of [['  DESIGN ', 'Design'], ['%', '50%'], ['_', 'a_b'], ['\\', 'a\\b'], ['x'.repeat(90), 'x'.repeat(80)]]) {
    assert.deepEqual(plain((await h.listPublicPortals(query)).items.map(item => item.label)), [expected]);
  }
  assert.equal((await h.listPublicPortals('   ')).items.length, labels.length);
});

test('prototype portal pages use label/id order, 48 rows and the same offset normalization', async () => {
  const categories = Array.from({ length: 49 }, (_, index) => ({ id: `portal-${String(index).padStart(3, '0')}`, label: index === 48 ? 'Zebra' : 'Same' })).reverse();
  const h = mockFixture({ profiles: [prototypeProfile({ categories })] });
  const page = await h.listPublicPortals();
  assert.equal(page.items.length, 48);
  assert.equal(page.items[0].id, 'portal-000');
  assert.equal(page.items.at(-1).id, 'portal-047');
  assert.equal(page.nextOffset, 48);
  assert.deepEqual(plain(await h.listPublicPortals('', 48)), { items: [{ id: 'portal-048', profileId: 'creator', label: 'Zebra', creator: { id: 'creator', name: 'Creator', handle: 'creator', avatar: '/avatar.png' } }], nextOffset: null });
  for (const offset of [-1, NaN, Infinity]) assert.equal((await h.listPublicPortals('', offset)).items[0].id, 'portal-000');
  assert.equal((await h.listPublicPortals('', 1.9)).items[0].id, 'portal-001');
  assert.deepEqual(plain(await h.listPublicPortals('', Number.MAX_VALUE)), { items: [], nextOffset: null });
});

test('public portal directory is mandatory and wired to the dedicated Supabase implementation', () => {
  const contract = parse('src/services/interfaces.ts');
  const declaration = contract.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'DiscoveryService');
  const method = declaration.members.find(node => node.name?.getText(contract) === 'listPublicPortals');
  assert.ok(method && !method.questionToken, 'Every discovery implementation must provide the directory');
  assert.equal(method.type.getText(contract), 'Promise<PublicPortalPage>');
  const content = parse('src/services/supabase/contentServices.ts');
  const imported = content.statements.find(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === './publicPortalDirectory');
  assert.ok(imported.importClause.namedBindings.elements.some(node => node.name.text === 'listPublicPortals'));
  const wired = serviceDeclaration(content, 'supabaseDiscoveryService').initializer.properties.find(node => node.name?.getText(content) === 'listPublicPortals');
  assert.ok(ts.isShorthandPropertyAssignment(wired) || (ts.isPropertyAssignment(wired) && wired.initializer.getText(content) === 'listPublicPortals'));
});
