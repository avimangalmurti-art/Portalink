import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { deferMainStartupStyles, startupStylesPlugin } from '../scripts/startup-styles.mjs';

function fixture(states = ['pending', 'pending']) {
  let links, timerId = 0, reloads = 0;
  const timers = new Map();
  function node(tag) {
    return {
      tag, children: [], dataset: {}, listeners: new Map(), media: 'print', sheet: null,
      append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); },
      setAttribute(name, value) { this[name] = value; },
      querySelector(tag) { return this.children.find(child => child.tag === tag); },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
      addEventListener(name, callback) { this.listeners.set(name, callback); },
      removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); },
      cloneNode() { return { ...node(tag), href: this.href, dataset: { ...this.dataset } }; },
      replaceWith(replacement) { links = links.map(link => link === this ? replacement : link); },
      emit(name) { if (name === 'load') this.sheet = {}; this.listeners.get(name)?.(); },
    };
  }
  const preboot = node('div'); preboot.id = 'portalink-preboot';
  const art = node('img'); art.src = 'data:image/webp;base64,first-frame'; preboot.append(art);
  links = states.map((state, index) => {
    const link = node('link'); link.href = `https://portalink.example/assets/style-${index}.css`;
    if (state === 'ready' || state === 'error') link.dataset.portalinkStyleStatus = state;
    if (state === 'sheet') link.sheet = {};
    return link;
  });
  const document = {
    baseURI: 'https://portalink.example/',
    querySelectorAll: () => links,
    getElementById: id => id === preboot.id ? preboot : preboot.children.find(child => child.id === id) ?? null,
    createElement: node,
  };
  const window = {
    location: { reload() { reloads++; } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const { waitForStartupStyles } = sourceModule('src/app/startupStyles.ts', {}, { document, window });
  let mounted = 0;
  const done = waitForStartupStyles().then(() => mounted++);
  return {
    done, preboot, art, timers, get links() { return links; }, get mounted() { return mounted; }, get reloads() { return reloads; },
    get status() { return document.getElementById('portalink-preboot-status'); },
    timeout() { const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.callback()); },
    async flush() { for (let i = 0; i < 4; i++) await Promise.resolve(); },
  };
}

test('the final bundle hook defers only emitted main-entry CSS after Vite HTML injection', () => {
  const html = '<head><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Font" media="print"><link rel="stylesheet" crossorigin href="/assets/main-hash.css"><link rel="stylesheet" href="/unrelated.css"></head>';
  const bundle = {
    'index.html': { type: 'asset', fileName: 'index.html', source: html },
    'share.html': { type: 'asset', fileName: 'share.html', source: html },
    'cite.html': { type: 'asset', fileName: 'cite.html', source: html },
    'assets/main-hash.css': { type: 'asset', fileName: 'assets/main-hash.css' },
  };
  const plugin = startupStylesPlugin();
  assert.equal(plugin.enforce, 'post'); assert.equal(plugin.generateBundle.order, 'post');
  plugin.generateBundle.handler({}, bundle);
  assert.equal(bundle['share.html'].source, html); assert.equal(bundle['cite.html'].source, html);
  assert.equal((bundle['index.html'].source.match(/data-portalink-app-style/g) ?? []).length, 1);
  assert.match(bundle['index.html'].source, /href="\/assets\/main-hash\.css" media="print"/);
  assert.match(bundle['index.html'].source, /portalinkStyleStatus='ready'/);
  assert.equal(deferMainStartupStyles(bundle['index.html'].source, ['assets/main-hash.css']), bundle['index.html'].source);
});

test('React waits for every required sheet, including cached sheets that loaded before the module', async () => {
  const f = fixture(['ready', 'sheet', 'pending']); await f.flush();
  assert.equal(f.mounted, 0); assert.equal(f.preboot.children[0], f.art);
  f.links[2].emit('load'); await f.done;
  assert.equal(f.mounted, 1); assert.equal(f.reloads, 0); assert.equal(f.timers.size, 0);
  assert.ok(f.links.every(link => link.media === 'all' && link.listeners.size === 0));
  assert.equal(f.status, null);
});

test('a failed stylesheet keeps the first scene and Retry replaces only unresolved requests', async () => {
  const f = fixture(['ready', 'pending', 'pending']);
  const retained = f.links[0], oldPending = f.links[1], staleFailure = oldPending.listeners.get('error');
  oldPending.emit('error'); await f.flush();
  assert.equal(f.mounted, 0); assert.equal(f.preboot.children[0], f.art);
  assert.equal(f.status.role, 'alert'); assert.match(f.status.querySelector('p').textContent, /could not finish opening/);
  f.status.querySelector('button').onclick();
  assert.equal(f.links[0], retained); assert.notEqual(f.links[1], oldPending);
  assert.match(f.links[1].href, /portalink-style-retry=1/); assert.equal(oldPending.listeners.size, 0);
  assert.equal(f.status.role, 'status'); staleFailure(); assert.equal(f.status.role, 'status');
  f.links[1].emit('load'); await f.flush(); assert.equal(f.mounted, 0);
  f.links[2].emit('load'); await f.flush();
  assert.equal(f.reloads, 1); assert.equal(f.mounted, 0, 'The old module realm must not mount cached rejected lazy imports');
  assert.equal(f.preboot.children[0], f.art); assert.equal(f.timers.size, 0);
  assert.ok(f.links.every(link => link.listeners.size === 0));
  f.links[2].emit('load'); staleFailure(); await f.flush(); assert.equal(f.reloads, 1);
});

test('a never-settling request offers a bounded Retry and late real CSS may still finish safely', async () => {
  const f = fixture(['pending']); assert.equal([...f.timers.values()][0].delay, 12000);
  f.timeout(); await f.flush(); assert.equal(f.mounted, 0); assert.equal(f.status.querySelector('button').disabled, false);
  f.links[0].emit('load'); await f.done; assert.equal(f.mounted, 1); assert.equal(f.reloads, 0); assert.equal(f.status, null);
});

test('CSS failure before main JavaScript is recognized, while unmarked development/public styles do not add a gate', async () => {
  const failed = fixture(['error']); await failed.flush();
  assert.equal(failed.mounted, 0); assert.equal(failed.status.role, 'alert');
  failed.status.querySelector('button').onclick(); failed.links[0].emit('load'); await failed.flush();
  assert.equal(failed.reloads, 1); assert.equal(failed.mounted, 0);
  const unmarked = fixture([]); await unmarked.done;
  assert.equal(unmarked.mounted, 1); assert.equal(unmarked.timers.size, 0);
});

test('a timeout Retry also reloads exactly once after every stylesheet recovers', async () => {
  const f = fixture(['pending', 'pending']); f.timeout();
  f.status.querySelector('button').onclick();
  f.links[0].emit('load'); await f.flush(); assert.equal(f.reloads, 0); assert.equal(f.mounted, 0);
  f.links[1].emit('load'); await f.flush();
  assert.equal(f.reloads, 1); assert.equal(f.mounted, 0);
  assert.equal(f.preboot.children[0], f.art); assert.equal(f.status.role, 'status');
  assert.equal(f.timers.size, 0); assert.ok(f.links.every(link => link.listeners.size === 0));
  f.links[1].emit('load'); await f.flush(); assert.equal(f.reloads, 1);
});
