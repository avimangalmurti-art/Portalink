import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const modules = new Map();
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const exports = {};
  modules.set(url.href, exports);
  vm.runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(name) { return load(new URL(`${name}.ts`, url).href); },
    fetch() { throw new Error('Tests must use the injected directory fetcher.'); },
  }, { filename: url.pathname });
  return exports;
}
const directory = load('../src/data/locationDirectory.ts');
const { LOCATION_DIRECTORY_MANIFEST } = load('../src/data/locationDirectoryVersion.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const asset = url => JSON.parse(readFileSync(new URL(`../public${url}`, import.meta.url), 'utf8'));
const manifest = asset(LOCATION_DIRECTORY_MANIFEST);

test('country qualifiers accept aliases and never match inside another country name', async () => {
  const h = harness();
  for (const query of ['London, UK', 'London, GB', 'London, GBR', 'London, United Kingdom']) {
    assert.ok((await h.client.search(query)).some(place => place.id === 'gn-2643743'), query);
  }
  const york = await h.client.search('York, US');
  assert.ok(york.length > 0);
  assert.ok(york.every(place => place.countryCode === 'US'));
  assert.ok(!(await h.client.search('York, Austria')).some(place => place.countryCode === 'AU'));
  assert.ok((await h.client.search('San Francisco, USA')).some(place => place.id === 'gn-5391959'));
});

function harness(intercept) {
  const calls = [];
  const fetcher = async (url, options) => {
    assert.match(url, /^\/assets\/locations\/(?:manifest|search-\d+|ids-\d+)-[a-f0-9]{16}\.json$/);
    assert.deepEqual(plain(options), { credentials: 'omit', cache: 'force-cache' });
    calls.push(url);
    const replacement = await intercept?.(url, calls);
    return replacement ?? { ok: true, json: async () => asset(url) };
  };
  return { client: directory.createLocationDirectory(fetcher), calls };
}

test('directory is lazy and legacy city routes resolve without downloading assets', async () => {
  const h = harness();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(plain(await h.client.search('  ')), []);
  for (const invalid of ['unknown-city', 'gn-0', 'gn-abc', 'gn-1/other', 'https://example.com']) {
    assert.equal(await h.client.resolve(invalid), null);
  }
  const city = await h.client.resolve('san-francisco');
  assert.equal(city.id, 'san-francisco');
  assert.equal(city.name, 'San Francisco');
  assert.equal(city.countryCode, 'US');
  assert.equal(city.legacy, true);
  assert.equal(city.latitude, 37.77);
  assert.deepEqual(h.calls, []);
});

test('a noncatalog city loads one own-origin search shard, then caches it', async () => {
  const h = harness();
  const results = await h.client.search('Oakland, California, US');
  const city = results.find(place => place.id === 'gn-5378538');
  assert.ok(city);
  assert.equal(city.name, 'Oakland');
  assert.equal(city.regionName, 'California');
  assert.equal(city.countryName, 'United States');
  assert.equal(city.legacy, undefined);
  assert.equal(directory.placeLabel(city), 'Oakland, California, US');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0], LOCATION_DIRECTORY_MANIFEST);
  assert.match(h.calls[1], /\/search-\d+-/);
  await h.client.search('Oakland, California, US');
  await h.client.search('Oakl');
  assert.equal(h.calls.length, 2, 'a longer/shorter prefix in the same shard reuses parsed data');
});

test('concurrent searches and ID lookups share in-flight manifest and shard requests', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const h = harness(async url => { if (url === LOCATION_DIRECTORY_MANIFEST) await blocked; });
  const first = h.client.search('Oakland');
  const second = h.client.search('Oakl');
  const third = h.client.resolve('gn-5378538');
  const fourth = h.client.resolve('gn-5378538');
  assert.deepEqual(h.calls, [LOCATION_DIRECTORY_MANIFEST]);
  release();
  const [a, b, c, d] = await Promise.all([first, second, third, fourth]);
  assert.ok(a.some(place => place.id === c.id));
  assert.ok(b.some(place => place.id === c.id));
  assert.deepEqual(plain(c), plain(d));
  assert.equal(h.calls.filter(url => url === LOCATION_DIRECTORY_MANIFEST).length, 1);
  assert.equal(h.calls.filter(url => url.includes('/search-')).length, 1);
  assert.equal(h.calls.filter(url => url.includes('/ids-')).length, 1);
  await h.client.resolve(c.id);
  assert.equal(h.calls.length, 3);
});

test('ASCII and diacritic queries find the same real city and canonical coordinates', async () => {
  const h = harness();
  const native = await h.client.search('  São   Paulo, BR ');
  const ascii = await h.client.search('SAO PAULO, bra');
  const a = native.find(place => place.id === 'gn-3448439');
  const b = ascii.find(place => place.id === 'gn-3448439');
  assert.ok(a); assert.ok(b);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(a.asciiName, 'Sao Paulo');
  assert.equal(a.timezone, 'America/Sao_Paulo');
  assert.ok(a.latitude < -23 && a.latitude > -24);
  assert.equal(directory.locationSearchShard('São'), directory.locationSearchShard('sao'));
  assert.equal(h.calls.length, 2);
});

test('short-name cities are searchable with country qualifiers without any city shard', async () => {
  const h = harness();
  for (const [query, id] of [['Os, NO', 'gn-3143303'], ['Lu, IT', 'gn-3174535'], ['Ub, RS', 'gn-784795']]) {
    assert.ok((await h.client.search(query)).some(place => place.id === id), query);
  }
  assert.deepEqual(h.calls, [LOCATION_DIRECTORY_MANIFEST]);
  assert.ok(!(await h.client.search('Os, IT')).some(place => place.id === 'gn-3143303'));
});

test('same-name cities have independent stable IDs and ambiguous profile labels match neither', async () => {
  const h = harness();
  const first = await h.client.resolve('gn-1795565');
  const second = await h.client.resolve('gn-1795566');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.longitude, second.longitude);
  assert.equal(directory.placeLabel(first), directory.placeLabel(second));
  assert.equal(first.uniqueInRegion, false);
  assert.equal(second.uniqueInRegion, false);
  for (const city of [first, second]) {
    assert.equal(directory.profileMatchesPlace('Shenzhen, Guangdong, CN', city), false);
    assert.equal(directory.profileMatchesPlace('Shenzhen, CN', city), false);
    assert.equal(directory.profileMatchesPlace('Shenzhen', city), false);
  }
  const matches = await h.client.search('Shenzhen, Guangdong, CN');
  assert.ok(matches.some(place => place.id === first.id));
  assert.ok(matches.some(place => place.id === second.id));
});

test('ASCII aliases cannot bypass duplicate-city protection', async () => {
  const h = harness();
  const first = await h.client.resolve('gn-2844829');
  const second = await h.client.resolve('gn-2844844');
  assert.equal(first.name, 'Rossbach');
  assert.equal(second.name, 'Roßbach');
  assert.equal(second.asciiName, 'Rossbach');
  assert.equal(first.regionCode, second.regionCode);
  for (const city of [first, second]) {
    assert.equal(city.uniqueInRegion, false, city.id);
    assert.equal(city.uniqueInCountry, false, city.id);
    assert.equal(directory.profileMatchesPlace(`Rossbach, ${city.regionName}, DE`, city), false, city.id);
    assert.equal(directory.profileMatchesPlace('Rossbach, DE', city), false, city.id);
  }
});

test('city matching requires exact names and explicit unambiguous region/country qualifiers', async () => {
  const h = harness();
  const oakland = await h.client.resolve('gn-5378538');
  assert.equal(oakland.uniqueInCountry, false);
  assert.equal(oakland.uniqueInRegion, true);
  for (const value of ['Oakland, California, US', 'oakland, CA, USA', 'Oakland, California, United States of America']) {
    assert.equal(directory.profileMatchesPlace(value, oakland), true, value);
  }
  for (const value of [undefined, '', 'Oakland', 'Oakland, US', 'Oakland, California, CA', 'Oakland, New California, US', 'North Oakland, California, US']) {
    assert.equal(directory.profileMatchesPlace(value, oakland), false, String(value));
  }
  const saoPaulo = await h.client.resolve('gn-3448439');
  assert.equal(directory.profileMatchesPlace('Sao Paulo, BR', saoPaulo), true);
  assert.equal(directory.profileMatchesPlace('São Paulo, Brazil', saoPaulo), true);
});

test('country and region IDs resolve from the manifest and use exact geographic qualifiers', async () => {
  const h = harness();
  const countryRow = manifest.countries.find(row => row[0] === 'US');
  const regionRow = manifest.regions.find(row => row[0] === 'US.CA');
  const country = await h.client.resolve(`gn-${countryRow[2]}`);
  const region = await h.client.resolve(`gn-${regionRow[3]}`);
  assert.equal(country.kind, 'country');
  assert.equal(region.kind, 'region');
  assert.equal(directory.placeLabel(country), 'United States');
  assert.equal(directory.placeLabel(region), 'California, US');
  assert.equal(directory.profileMatchesPlace('Oakland, California, US', region), true);
  assert.equal(directory.profileMatchesPlace('Oakland, CA, USA', region), true);
  for (const value of ['Oakland, New California, US', 'California, CA', 'California', 'Oakland, US']) {
    assert.equal(directory.profileMatchesPlace(value, region), false, value);
  }
  assert.equal(directory.profileMatchesPlace('United States', country), true);
  assert.equal(directory.profileMatchesPlace('Oakland, California, USA', country), true);
  assert.equal(directory.profileMatchesPlace('United States of America', country), true);
  assert.equal(directory.profileMatchesPlace('United States Minor Outlying Islands', country), false);
  assert.deepEqual(h.calls, [LOCATION_DIRECTORY_MANIFEST]);
});

test('exact country and region names stay discoverable ahead of homonymous cities at the default limit', async () => {
  const h = harness();
  const california = await h.client.search('California');
  const region = manifest.regions.find(row => row[0] === 'US.CA');
  assert.ok(california.length <= 8);
  assert.equal(california[0].id, `gn-${region[3]}`);
  assert.equal(california[0].kind, 'region');
  assert.ok(california.some(place => place.kind === 'city'), 'homonymous cities remain available after the region');
  const country = manifest.countries.find(row => row[0] === 'US');
  const unitedStates = await h.client.search('United States');
  assert.equal(unitedStates[0].id, `gn-${country[2]}`);
  assert.equal(unitedStates[0].kind, 'country');
});

test('profile labels obey the existing 48-character limit without truncation or ambiguous compaction', () => {
  const city = { id: 'gn-123', kind: 'city', name: 'N'.repeat(44), countryCode: 'US', countryName: 'United States', countryIso3: 'USA', uniqueInCountry: true };
  assert.equal(directory.profilePlaceLabel(city), `${city.name}, US`);
  assert.equal(directory.profilePlaceLabel(city).length, 48);
  assert.equal(directory.profilePlaceLabel({ ...city, name: 'N'.repeat(45) }), null);
  const longRegion = { ...city, name: 'Small City', regionName: 'A regional name that makes the full label exceed the limit' };
  assert.equal(directory.profilePlaceLabel(longRegion), 'Small City, US');
  assert.equal(directory.profilePlaceLabel({ ...longRegion, uniqueInCountry: false }), null);
  assert.equal(directory.profilePlaceLabel({ ...longRegion, kind: 'region' }), 'Small City, US');
  assert.equal(directory.profilePlaceLabel({ ...city, kind: 'country', name: 'C'.repeat(49) }), null);
});

test('failed manifest downloads are evicted and a retry can succeed', async () => {
  let fail = true;
  const h = harness(url => {
    if (url === LOCATION_DIRECTORY_MANIFEST && fail) { fail = false; return { ok: false }; }
  });
  await assert.rejects(h.client.search('Oakland'), /could not be loaded/);
  assert.ok((await h.client.search('Oakland')).some(place => place.id === 'gn-5378538'));
  assert.equal(h.calls.filter(url => url === LOCATION_DIRECTORY_MANIFEST).length, 2);
  assert.equal(h.calls.filter(url => url.includes('/search-')).length, 1);
});

test('a rejected shard download retries without refetching the successful manifest', async () => {
  let fail = true;
  const h = harness(url => {
    if (url.includes('/ids-') && fail) { fail = false; throw new Error('Network interrupted'); }
  });
  await assert.rejects(h.client.resolve('gn-5378538'), /Network interrupted/);
  assert.equal((await h.client.resolve('gn-5378538')).name, 'Oakland');
  assert.equal(h.calls.filter(url => url === LOCATION_DIRECTORY_MANIFEST).length, 1);
  assert.equal(h.calls.filter(url => url.includes('/ids-')).length, 2);
});

test('manifest shard paths cannot redirect directory requests to another origin', async () => {
  const malicious = structuredClone(manifest);
  malicious.search[directory.locationSearchShard('Oakland')] = 'https://example.com/locations.json';
  const h = harness(url => url === LOCATION_DIRECTORY_MANIFEST ? { ok: true, json: async () => malicious } : undefined);
  await assert.rejects(h.client.search('Oakland'), /Invalid location directory asset/);
  assert.deepEqual(h.calls, [LOCATION_DIRECTORY_MANIFEST]);
});

test('an unknown valid GeoNames ID returns no invented destination', async () => {
  const h = harness();
  assert.equal(await h.client.resolve('gn-9999999999'), null);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1], /\/ids-\d+-/);
});

const placement = load('../src/domain/contentPlacement.ts');
const serviceSource = ts.createSourceFile('contentServices.ts', readFileSync(new URL('../src/services/supabase/contentServices.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const serviceFunction = name => serviceSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(serviceSource);
function serviceMethod(source, service, method) {
  const declaration = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
    .find(node => node.name.getText(source) === service);
  return declaration.initializer.properties.find(node => node.name?.getText(source) === method).getText(source);
}

function locationFeedFixture() {
  const profiles = [
    { id: 'california', location: 'Oakland, California, US', is_private: false },
    { id: 'oregon', location: 'Oakland, Oregon, US', is_private: false },
    { id: 'canada', location: 'Oakland, Ontario, CA', is_private: false },
    { id: 'private', location: 'Oakland, California, US', is_private: true },
    { id: 'legacy', location: 'San Francisco', is_private: false },
    { id: 'private-legacy', location: 'San Francisco', is_private: true },
    { id: 'missing-location', location: '', is_private: false },
  ];
  const categories = profiles.map(profile => ({ id: `${profile.id}-portal`, profile_id: profile.id, is_hidden: false }));
  categories.push({ id: 'hidden-portal', profile_id: 'california', is_hidden: true });
  const projects = profiles.map(profile => ({ id: `${profile.id}-project`, profile_id: profile.id, category_id: `${profile.id}-portal`, is_hidden: false }));
  projects.push(
    { id: 'hidden-project', profile_id: 'california', category_id: 'california-portal', is_hidden: true },
    { id: 'hidden-portal-project', profile_id: 'california', category_id: 'hidden-portal', is_hidden: false },
  );
  return { profiles, categories, projects };
}

function productionFeedHarness({ errorTable, user = { id: 'reader' } } = {}) {
  const rows = locationFeedFixture();
  const tables = { profiles: rows.profiles, portfolio_categories: rows.categories, projects: rows.projects };
  const queries = [], hydrated = [];
  const directoryRequests = harness();
  const client = {
    auth: { async getUser() { return { data: { user }, error: null }; } },
    from(table) {
      const filters = [];
      let start = 0, end = Infinity;
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push(row => row[column] === value); return builder; },
        in(column, values) { filters.push(row => values.includes(row[column])); return builder; },
        order() { return builder; },
        limit(size) { end = size; return builder; },
        range(from, to) { start = from; end = to + 1; return builder; },
        then(resolve, reject) {
          queries.push(table);
          return Promise.resolve(errorTable === table ? { data: null, error: { message: 'Access denied' } } : {
            data: tables[table].filter(row => filters.every(filter => filter(row))).slice(start, end), error: null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', {
    './client': { requireSupabase: () => client },
  });
  const exports = {};
  const helpers = ['visibleCategoryIdsForProfiles', 'projectIdsForProfiles', 'projectViewsForIds'].map(serviceFunction).join('\n');
  vm.runInNewContext(ts.transpileModule(`${helpers}\nexports.service={${serviceMethod(serviceSource, 'supabaseDiscoveryService', 'listLocationProjects')}}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, requireDirectoryAccount, requireSupabase: () => client, locationDirectory: directoryRequests.client,
    profileMatchesPlace: directory.profileMatchesPlace, creatorLocationMatches: placement.creatorLocationMatches,
    supabaseProjectService: { async listProjectViews(ids) {
      hydrated.push(...ids);
      return [...ids].reverse().map(id => ({ project: { id } }));
    } },
  });
  return { service: exports.service, queries, hydrated, directoryRequests: directoryRequests.calls };
}

test('production city, region and country feeds exclude private profiles and hidden content before hydration', async () => {
  const country = manifest.countries.find(row => row[0] === 'US');
  const region = manifest.regions.find(row => row[0] === 'US.CA');
  for (const [id, expected] of [
    ['gn-5378538', ['california-project']],
    [`gn-${region[3]}`, ['california-project']],
    [`gn-${country[2]}`, ['california-project', 'oregon-project']],
  ]) {
    const h = productionFeedHarness();
    const result = await h.service.listLocationProjects(id);
    assert.deepEqual(plain(result.map(view => view.project.id)), expected, id);
    assert.deepEqual(plain(h.hydrated), expected, 'private/hidden IDs must not reach attachment hydration');
    assert.deepEqual(h.queries, ['profiles', 'portfolio_categories', 'projects']);
  }
});

test('production legacy routes retain name-only profile matches and their visibility restrictions', async () => {
  const h = productionFeedHarness();
  const result = await h.service.listLocationProjects('san-francisco');
  assert.deepEqual(plain(result.map(view => view.project.id)), ['legacy-project']);
  assert.deepEqual(plain(h.hydrated), ['legacy-project']);
});

test('missing locations and failed visibility reads never hydrate a location feed', async () => {
  const missing = productionFeedHarness();
  assert.deepEqual(plain(await missing.service.listLocationProjects('unknown-place')), []);
  assert.deepEqual(missing.queries, []);
  for (const errorTable of ['profiles', 'portfolio_categories', 'projects']) {
    const h = productionFeedHarness({ errorTable });
    await assert.rejects(h.service.listLocationProjects('gn-5378538'), /Access denied/);
    assert.deepEqual(h.hydrated, []);
  }
});

test('location feeds reject guest identities before directory or profile reads', async () => {
  for (const user of [null, { id: 'guest', is_anonymous: true }]) {
    const h = productionFeedHarness({ user });
    await assert.rejects(h.service.listLocationProjects('gn-5378538'), /Create an account or sign in/);
    assert.deepEqual(h.directoryRequests, []);
    assert.deepEqual(h.queries, []);
    assert.deepEqual(h.hydrated, []);
  }
});

test('prototype city, region, country and legacy feeds apply the same privacy and placement decisions', async () => {
  const source = ts.createSourceFile('mocks.ts', readFileSync(new URL('../src/services/mocks/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const rows = locationFeedFixture();
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.service={${serviceMethod(source, 'mockDiscoveryService', 'listLocationProjects')}}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: () => ({ locationDirectory: harness().client, profileMatchesPlace: directory.profileMatchesPlace }),
    resolve: value => Promise.resolve(value), creatorLocationMatches: placement.creatorLocationMatches,
    decideProjectPlacement: placement.decideProjectPlacement,
    prototypeViews: () => rows.projects.map(project => {
      const profile = rows.profiles.find(row => row.id === project.profile_id);
      const category = rows.categories.find(row => row.id === project.category_id);
      return {
        view: { creator: { id: profile.id, isPrivate: profile.is_private, location: profile.location }, project: { id: project.id, categoryId: category.id } },
        flags: { isCategoryHidden: category.is_hidden, isProjectHidden: project.is_hidden },
      };
    }),
  });
  const country = manifest.countries.find(row => row[0] === 'US');
  const region = manifest.regions.find(row => row[0] === 'US.CA');
  for (const [id, expected] of [
    ['gn-5378538', ['california-project']],
    [`gn-${region[3]}`, ['california-project']],
    [`gn-${country[2]}`, ['california-project', 'oregon-project']],
    ['san-francisco', ['legacy-project']],
  ]) {
    assert.deepEqual(plain((await exports.service.listLocationProjects(id)).map(view => view.project.id)), expected, id);
  }
});

test('globe default city recommendations resolve to five distinct real city records',async()=>{
 const h=harness();const resolved=[];
 for(const name of ['San Francisco','New York','London','Tokyo','Paris']){
  const matches=await h.client.search(name);const city=matches.find(place=>place.kind==='city'&&place.name.toLowerCase()===name.toLowerCase())??matches.find(place=>place.kind==='city');
  assert.ok(city,name);assert.ok(Number.isFinite(city.latitude)&&Number.isFinite(city.longitude));resolved.push(city.id);
 }
 assert.equal(new Set(resolved).size,5);
});
