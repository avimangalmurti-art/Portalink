import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const origin = 'https://portalink.example';
const asset = `${origin}/assets/screen-abc123.css`;
const cssError = href => new Error(`Unable to preload CSS for ${href}`);

function fixture() {
  let timerId = 0;
  const timers = new Map();
  const links = [];
  const replacements = [];
  const captureListeners = new Map();
  function makeLink(href, properties = {}) {
    const listeners = new Map();
    const link = {
      href, rel: 'stylesheet', nodeName: 'LINK', nonce: 'nonce-value', crossOrigin: 'anonymous',
      integrity: 'sha384-example', referrerPolicy: 'no-referrer', media: 'all',
      disabled: false, isConnected: true, sheet: null, listeners,
      ...properties,
      relList: { contains: value => link.rel.split(/\s+/).includes(value) },
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
      cloneNode() {
        const clone = makeLink(this.href, {
          rel: this.rel, nonce: this.nonce, crossOrigin: this.crossOrigin, integrity: this.integrity,
          referrerPolicy: this.referrerPolicy, media: this.media, disabled: this.disabled,
        });
        clone.isConnected = false;
        return clone;
      },
      replaceWith(replacement) {
        const index = links.indexOf(this);
        assert.ok(index >= 0, 'Only the existing stylesheet may be replaced');
        links[index] = replacement;
        this.isConnected = false; replacement.isConnected = true;
        replacements.push({ original: this, replacement });
      },
      emit(type) {
        if (type === 'load') this.sheet = {};
        captureListeners.get(type)?.({ type, target: this });
        listeners.get(type)?.();
      },
    };
    return link;
  }
  const document = {
    addEventListener(type, callback, capture) { assert.equal(capture, true); captureListeners.set(type, callback); },
    querySelectorAll(selector) {
      assert.equal(selector, 'link[rel~="stylesheet"]');
      return links.filter(link => link.rel.split(/\s+/).includes('stylesheet'));
    },
  };
  const window = {
    location: { href: `${origin}/profile`, origin },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const api = sourceModule('src/components/ui/moduleLoadRecovery.ts', {}, { document, window, DOMException });
  return {
    ...api, links, timers, replacements,
    add(href = asset, properties = {}) { const link = makeLink(href, properties); links.push(link); return link; },
    timeout() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.callback()); },
  };
}

test('only known native JS import, ChunkLoadError and exact Vite CSS errors qualify', () => {
  const { isModuleDownloadFailure } = fixture();
  for (const error of [
    new TypeError(`Failed to fetch dynamically imported module: ${origin}/assets/screen.js`),
    new TypeError(`error loading dynamically imported module: ${origin}/assets/screen.js`),
    new TypeError('Importing a module script failed.'),
    Object.assign(new Error('Loading chunk 123 failed.\n(error: https://portalink.example/assets/123.js)'), { name: 'ChunkLoadError' }),
    cssError(asset),
  ]) assert.equal(isModuleDownloadFailure(error), true, error.message);
  for (const error of [
    null, 'Failed to fetch dynamically imported module', new TypeError('Failed to fetch'),
    new TypeError("Cannot read properties of undefined (reading 'default')"),
    new Error('Importing a module script failed.'), new SyntaxError('Unexpected token'),
    new Error('Loading chunk 123 failed.'), cssError(`${asset}\nextra text`),
    new Error('Unable to preload CSS'),
    { get name() { throw new Error('untrusted getter'); } },
  ]) assert.equal(isModuleDownloadFailure(error), false);
});

test('a JS failure has no stylesheet side effects and an already-aborted caller cannot start recovery', async () => {
  const f = fixture(); f.add();
  await f.recoverModuleStyles(new TypeError('Importing a module script failed.'), new AbortController().signal);
  assert.equal(f.replacements.length, 0); assert.equal(f.timers.size, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.recoverModuleStyles(cssError(asset), controller.signal), error => error.name === 'AbortError');
  assert.equal(f.replacements.length, 0);
});

test('CSS recovery replaces only its failed link, preserves security attributes, and waits for real load', async () => {
  const f = fixture(), healthy = f.add(`${origin}/assets/healthy.css`, { sheet: {} });
  const failed = f.add(), unrelated = f.add(`${origin}/other.css`);
  let resolved = false;
  const pending = f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { resolved = true; });
  assert.equal(f.links[0], healthy); assert.equal(f.links[2], unrelated);
  assert.notEqual(f.links[1], failed); assert.equal(f.replacements.length, 1);
  const retry = f.links[1], url = new URL(retry.href);
  assert.equal(url.origin, origin); assert.equal(url.pathname, '/assets/screen-abc123.css');
  assert.equal(url.searchParams.get('portalink-module-style-retry'), '1');
  for (const property of ['nonce', 'crossOrigin', 'integrity', 'referrerPolicy', 'media']) assert.equal(retry[property], failed[property]);
  assert.equal([...f.timers.values()][0].delay, 12_000);
  await Promise.resolve(); assert.equal(resolved, false);
  retry.emit('load'); await pending;
  assert.equal(resolved, true); assert.equal(f.timers.size, 0); assert.equal(retry.listeners.size, 0);
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  assert.equal(f.replacements.length, 1, 'A recovered immutable sheet is reused without another request');
});

test('an observed real load after the original failure needs no replacement', async () => {
  const f = fixture(), loaded = f.add();
  loaded.emit('error'); loaded.emit('load');
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  assert.equal(f.links[0], loaded); assert.equal(f.replacements.length, 0); assert.equal(f.timers.size, 0);
});

test('only a matching same-origin emitted CSS asset can be repaired', async () => {
  for (const href of [
    'https://other.example/assets/screen.css', `${origin}/api/private.css`,
    `${origin}/assets/nested/private.css`, `${origin}/assets/encoded%2Fprivate.css`,
    `${origin}/assets/screen.css?token=private`, `${origin}/assets/screen.css#fragment`,
    'https://user:password@portalink.example/assets/screen.css',
    'data:text/css,body{}', 'javascript:alert(1)', 'http://[invalid',
  ]) {
    const f = fixture(); f.add(href);
    await assert.rejects(f.recoverModuleStyles(cssError(href), new AbortController().signal));
    assert.equal(f.replacements.length, 0, href); assert.equal(f.timers.size, 0);
  }
  for (const properties of [null, { rel: 'modulepreload' }, { disabled: true }, { isConnected: false }]) {
    const f = fixture(); if (properties) f.add(asset, properties);
    await assert.rejects(f.recoverModuleStyles(cssError(asset), new AbortController().signal));
    assert.equal(f.replacements.length, 0);
  }
});

test('relative Vite CSS URLs are normalized against the actual same-origin location', async () => {
  const f = fixture(); f.add();
  const pending = f.recoverModuleStyles(cssError('/assets/screen-abc123.css'), new AbortController().signal);
  f.links[0].emit('load'); await pending;
  assert.equal(new URL(f.links[0].href).origin, origin);
});

test('concurrent owners share one request and one abort cannot cancel another owner', async () => {
  const f = fixture(); f.add();
  const first = new AbortController(), second = new AbortController();
  const cancelled = f.recoverModuleStyles(cssError(asset), first.signal);
  const cancelledAssertion = assert.rejects(cancelled, error => error.name === 'AbortError');
  const retained = f.recoverModuleStyles(cssError(asset), second.signal);
  assert.equal(f.replacements.length, 1); assert.equal(f.timers.size, 1);
  first.abort(); await cancelledAssertion;
  assert.equal(f.timers.size, 1); assert.equal(f.links[0].listeners.size, 2);
  f.links[0].emit('load'); await retained;
  assert.equal(f.timers.size, 0); assert.equal(f.links[0].listeners.size, 0);
});

test('the final abort cleans timer and listeners and a late event cannot settle cancelled work', async () => {
  const f = fixture(); f.add();
  const controller = new AbortController();
  const pending = f.recoverModuleStyles(cssError(asset), controller.signal);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  const staleLoad = f.links[0].listeners.get('load');
  controller.abort(); await rejected;
  assert.equal(f.timers.size, 0); assert.equal(f.links[0].listeners.size, 0);
  staleLoad();
  await assert.rejects(f.recoverModuleStyles(cssError(asset), new AbortController().signal), error => error.name === 'AbortError');
  assert.equal(f.replacements.length, 1, 'Cancellation cannot manufacture fresh requests');
});

test('error and timeout retain failure and enforce the single repair request budget', async () => {
  for (const fail of [f => f.links[0].emit('error'), f => f.timeout()]) {
    const f = fixture(); f.add();
    const pending = f.recoverModuleStyles(cssError(asset), new AbortController().signal);
    const rejected = assert.rejects(pending, /stylesheet could not be recovered/);
    fail(f); await rejected;
    assert.equal(f.timers.size, 0); assert.equal(f.links[0].listeners.size, 0);
    await assert.rejects(f.recoverModuleStyles(cssError(asset), new AbortController().signal), /stylesheet could not be recovered/);
    assert.equal(f.replacements.length, 1);
  }
});

test('a late successfully loaded sheet can be reused after a timeout without issuing another request', async () => {
  const f = fixture(); f.add();
  const pending = f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  const rejected = assert.rejects(pending); f.timeout(); await rejected;
  f.links[0].emit('load');
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  assert.equal(f.replacements.length, 1);
});

test('two failed Vite styles cannot unlock screen code after only the first reported sheet recovers', async () => {
  const f = fixture(); f.add();
  const siblingAsset = `${origin}/assets/sibling-def456.css`;
  const sibling = f.add(siblingAsset);
  let moduleReads = 0;
  const first = f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { moduleReads++; });
  const rejected = assert.rejects(first, /Other application stylesheets are still unavailable/);
  f.links[0].emit('load'); await rejected;
  assert.equal(moduleReads, 0, 'The factory must not read/render a module before every static sheet is ready');
  assert.equal(f.replacements.length, 1); assert.equal(f.links[1], sibling, 'An unreported sibling is never replaced speculatively');
  await assert.rejects(f.recoverModuleStyles(cssError(asset), new AbortController().signal), /Other application stylesheets/);
  assert.equal(f.replacements.length, 1);

  const second = f.recoverModuleStyles(cssError(siblingAsset), new AbortController().signal);
  assert.equal(f.replacements.length, 2, 'An independent failure owner may repair the sibling once');
  f.links[1].emit('load'); await second;
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { moduleReads++; });
  assert.equal(moduleReads, 1); assert.equal(f.replacements.length, 2);
});

test('the conservative guard covers cached and pending application sheets, but excludes unrelated or supplied query URLs', async () => {
  const f = fixture(), repaired = f.add(); repaired.emit('error'); repaired.emit('load');
  f.add('https://fonts.example/assets/font.css');
  f.add(`${origin}/private.css`);
  f.add(`${origin}/assets/supplied.css?token=unrelated`);
  f.add(`${origin}/assets/script.css`, { rel: 'modulepreload' });
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  const pending = f.add(`${origin}/assets/pending.css`);
  await assert.rejects(f.recoverModuleStyles(cssError(asset), new AbortController().signal), /Other application stylesheets/);
  pending.emit('load');
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  assert.equal(f.replacements.length, 0);
});

test('a reported HTTP-failed stylesheet is repaired even when Chrome exposes an empty truthy sheet', async () => {
  const f = fixture(), failed = f.add(asset, { sheet: {} });
  failed.emit('error');
  let ready = false;
  const pending = f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { ready = true; });
  assert.equal(f.replacements.length, 1, 'A truthy empty CSSStyleSheet does not establish a successful download');
  assert.notEqual(f.links[0], failed); await Promise.resolve(); assert.equal(ready, false);
  f.links[0].emit('load'); await pending;
  assert.equal(ready, true);
});

test('two captured HTTP-failed styles with truthy empty sheets cannot unlock partially styled code', async () => {
  const f = fixture(), failed = f.add(asset, { sheet: {} });
  const siblingAsset = `${origin}/assets/sibling-empty.css`;
  const sibling = f.add(siblingAsset, { sheet: {} });
  failed.emit('error'); sibling.emit('error');
  let moduleReads = 0;
  const first = f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { moduleReads++; });
  const rejected = assert.rejects(first, /Other application stylesheets/);
  f.links[0].emit('load'); await rejected;
  assert.equal(moduleReads, 0); assert.equal(f.links[1], sibling);
  const second = f.recoverModuleStyles(cssError(siblingAsset), new AbortController().signal);
  assert.equal(f.replacements.length, 2);
  f.links[1].emit('load'); await second;
  await f.recoverModuleStyles(cssError(asset), new AbortController().signal).then(() => { moduleReads++; });
  assert.equal(moduleReads, 1);
});

test('an unobserved truthy sheet cannot skip repair of the stylesheet named by Vite', async () => {
  const f = fixture(); f.add(asset, { sheet: {} });
  const pending = f.recoverModuleStyles(cssError(asset), new AbortController().signal);
  assert.equal(f.replacements.length, 1);
  f.links[0].emit('load'); await pending;
});
