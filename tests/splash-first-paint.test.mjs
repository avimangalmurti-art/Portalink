import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const poster = readFileSync(new URL('../src/components/ui/splashPoster.ts', import.meta.url), 'utf8').match(/SPLASH_POSTER_DATA_URL = '([^']+)'/)[1];

test('first artwork is identical and embedded in HTML and React without waiting for an image request', () => {
  const preboot = html.slice(html.indexOf('id="portalink-preboot"'), html.indexOf('<script type="module" src="/src/index.tsx"'));
  assert.ok(preboot.includes(`src="${poster}"`));
  assert.doesNotMatch(preboot, /<source|src="\//);
  assert.match(preboot, /width="512" height="720" decoding="sync" fetchpriority="high"/);
  const bytes = Buffer.from(poster.split(',')[1], 'base64');
  assert.deepEqual(bytes, readFileSync(new URL('../public/portalink-splash-first-frame.webp', import.meta.url)));
  assert.ok(bytes.length < 24000, 'critical artwork stays small enough to arrive with the HTML');
  assert.match(readFileSync(new URL('../src/components/ui/PortalinkSplashLoader.tsx', import.meta.url), 'utf8'), /SPLASH_POSTER_DATA_URL/);
});

function bootFixture({ shared = false } = {}) {
  const windowEvents = new Map(), documentEvents = new Map(), timers = new Map();
  let reloads = 0;
  const node = tag => ({ tagName: tag.toUpperCase(), children: [], attributes: new Map(), append(...children) { this.children.push(...children); children.forEach(child => { child.parent = this; }); }, setAttribute(name, value) { this.attributes.set(name, value); }, remove() { this.parent.children = this.parent.children.filter(child => child !== this); } });
  const preboot = node('div'), art = node('img'); preboot.id = 'portalink-preboot'; preboot.append(art);
  const document = {
    documentElement: { dataset: {}, hasAttribute: () => shared },
    getElementById: id => id === preboot.id ? preboot : preboot.children.find(child => child.id === id),
    createElement: node, querySelector: () => preboot.children.find(child => child.attributes.has('data-portalink-boot-status')),
    addEventListener: (name, callback) => documentEvents.set(name, callback), removeEventListener: name => documentEvents.delete(name),
  };
  const window = { location: { href: 'https://portalink.example/', origin: 'https://portalink.example', reload: () => reloads++ },
    addEventListener: (name, callback) => windowEvents.set(name, callback), removeEventListener: name => windowEvents.delete(name),
    setTimeout: (callback, delay) => { timers.set(1, { callback, delay }); return 1; }, clearTimeout: id => timers.delete(id) };
  const script = html.match(/<script data-portalink-boot-watchdog>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document, window, URL });
  return { art, preboot, document, timers, windowEvents, get status() { return document.getElementById('portalink-preboot-status'); }, get reloads() { return reloads; } };
}

test('entry-module failure or a never-settling request retains artwork and offers recovery before app code runs', () => {
  for (const timeout of [false, true]) {
    const f = bootFixture();
    if (timeout) { assert.equal(f.timers.get(1).delay, 12000); f.timers.get(1).callback(); }
    else f.windowEvents.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: '/assets/main.js' } });
    assert.equal(f.preboot.children[0], f.art);
    assert.equal(f.status.attributes.get('role'), 'alert');
    f.status.children[1].onclick(); assert.equal(f.reloads, 1);
  }
});

test('real entry readiness hands recovery ownership to CSS without changing public-link behavior', () => {
  const f = bootFixture(); f.timers.get(1).callback(); assert.ok(f.status);
  f.document.documentElement.dataset.portalinkEntryReady = 'true';
  f.windowEvents.get('portalink:main-entry-ready')();
  assert.equal(f.status, undefined); assert.equal(f.preboot.children[0], f.art); assert.equal(f.timers.size, 0); assert.equal(f.windowEvents.size, 0);
  const publicEntry = bootFixture({ shared: true }); publicEntry.timers.get(1).callback(); assert.equal(publicEntry.status, undefined);
  const external = bootFixture(); external.windowEvents.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: 'https://external.example/script.js' } }); assert.equal(external.status, undefined);
});
