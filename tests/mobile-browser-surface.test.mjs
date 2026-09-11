import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function style(initial = '') {
  let value = initial, priority = '';
  return { getPropertyValue: () => value, getPropertyPriority: () => priority,
    setProperty(_name, next, nextPriority = '') { value = next; priority = nextPriority; },
    removeProperty() { value = ''; priority = ''; } };
}
function harness(withMetadata = true) {
  const tags = [];
  function meta(attributes = {}) {
    const values = new Map(Object.entries(attributes));
    const tag = { getAttribute: name => values.get(name) ?? null,
      setAttribute: (name, value) => values.set(name, value), removeAttribute: name => values.delete(name),
      remove() { tags.splice(tags.indexOf(tag), 1); } };
    return tag;
  }
  if (withMetadata) tags.push(meta({ content: '#ffffff', media: '(prefers-color-scheme: light)' }),
    meta({ content: '#000000', media: '(prefers-color-scheme: dark)' }));
  const document = { documentElement: { style: style() }, body: { style: style() },
    querySelectorAll: () => tags, createElement: () => meta(), head: { appendChild: tag => tags.push(tag) } };
  const listeners = new Set();
  const window = { addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
  let token = '#181818', pendingEffect, cleanup, previousDeps;
  const ref = { current: {} };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useMobileBrowserSurface.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, document, window, getComputedStyle: () => ({ getPropertyValue: () => token }),
    require(name) {
      if (name === 'react') return { useRef: () => ref, useLayoutEffect: (effect, deps) => {
        if (!previousDeps || deps.some((dep, i) => dep !== previousDeps[i])) {
          cleanup?.(); pendingEffect = effect; previousDeps = deps;
        }
      } };
      if (name.endsWith('/splashLifecycle')) return { PORTALINK_SPLASH_EXIT_EVENT: 'portalink:splash-exited' };
      throw new Error(name);
    } });
  return { document, tags, listeners, setColor: color => { token = color; },
    render(presentation, appearance = undefined) {
      exports.useMobileBrowserSurface(presentation, appearance);
      if (pendingEffect) { cleanup = pendingEffect(); pendingEffect = undefined; }
    }, splashExit: () => listeners.forEach(fn => fn()), dispose: () => cleanup?.() };
}

test('mobile browser chrome follows the actual page surface rather than OS-only metadata', () => {
  const h = harness();
  h.render('mobile', { '--accent': 'pink' });
  for (const tag of h.tags) {
    assert.equal(tag.getAttribute('content'), '#181818');
    assert.equal(tag.getAttribute('media'), null);
  }
  assert.equal(h.document.documentElement.style.getPropertyValue('background-color'), '#181818');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#181818');
  h.setColor('#fafaf9');
  h.render('mobile', { '--accent': 'blue' });
  assert.equal(h.tags[0].getAttribute('content'), '#fafaf9');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#fafaf9');
  assert.equal(h.listeners.size, 1);
  h.dispose();
});

test('startup completion reapplies the page surface after the splash backdrop', () => {
  const h = harness();
  h.render('mobile');
  h.document.body.style.setProperty('background-color', '#f5eaf4');
  h.tags[0].setAttribute('content', '#f5eaf4');
  h.splashExit();
  assert.equal(h.document.body.style.getPropertyValue('background-color'), '#181818');
  assert.equal(h.tags[0].getAttribute('content'), '#181818');
  h.dispose();
});

test('WEB is untouched and switching back restores document styles and metadata exactly', () => {
  const h = harness();
  h.document.body.style.setProperty('background-color', 'navy', 'important');
  h.render('web');
  assert.equal(h.listeners.size, 0);
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  h.render('mobile');
  h.render('web');
  assert.equal(h.listeners.size, 0);
  assert.equal(h.tags[0].getAttribute('content'), '#ffffff');
  assert.equal(h.tags[0].getAttribute('media'), '(prefers-color-scheme: light)');
  assert.equal(h.tags[1].getAttribute('content'), '#000000');
  assert.equal(h.tags[1].getAttribute('media'), '(prefers-color-scheme: dark)');
  assert.equal(h.document.documentElement.style.getPropertyValue('background-color'), '');
  assert.equal(h.document.body.style.getPropertyValue('background-color'), 'navy');
  assert.equal(h.document.body.style.getPropertyPriority('background-color'), 'important');
});

test('missing metadata is created for mobile then removed on unmount', () => {
  const h = harness(false);
  h.render('mobile');
  assert.equal(h.tags.length, 1);
  assert.equal(h.tags[0].name, 'theme-color');
  h.dispose();
  assert.equal(h.tags.length, 0);
  assert.equal(h.listeners.size, 0);
});
