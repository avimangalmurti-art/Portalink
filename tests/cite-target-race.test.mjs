import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const citation = id => ({ id, attachmentId: 'attachment', projectId: 'source-project', creatorId: 'source-creator', creator: 'Source creator', projectTitle: 'Source work', madeOn: '2026-10-20', citable: true, kind: 'page', number: 1, storagePath: null });
const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };

/** Actual request hook with controllable network completion and effect cleanup. */
function fixture({ presentation = 'mobile', attachmentId = 'attachment', pageIndex = 0, visible = false } = {}) {
  const slots = [], listeners = new Map(), image = [], page = [], item = [];
  let cursor = 0, effects = [], result, mounted = true, dirty = true, writesAfterUnmount = 0;
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) {
      const index = cursor++; const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => { if (!mounted) { writesAfterUnmount++; return; } const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
    },
    useCallback(callback, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) {
      const index = cursor++, prior = slots[index];
      if (!equal(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; effects.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); }
    },
  };
  const defer = calls => (...args) => new Promise((resolve, reject) => calls.push({ args, resolve, reject }));
  const window = { addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); if (listeners.get(name)?.size === 0) listeners.delete(name); } };
  const api = sourceModule('src/features/citations/useCiteTarget.tsx', {
    react, './CitationReferences': { CitedIn: 'cited-in' }, './CiteSheet': { CiteSheet: 'sheet' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    './service': { resolveImageId: defer(image), resolvePageId: defer(page), resolveCitationItem: defer(item) },
  }, { window });
  function render(changes = {}) {
    ({ attachmentId, pageIndex, visible, presentation } = { attachmentId, pageIndex, visible, presentation, ...changes }); dirty = true;
    for (let pass = 0; dirty; pass++) { assert.ok(mounted, 'Cannot render an unmounted hook'); assert.ok(pass < 12, 'Hook state must settle'); dirty = false; cursor = 0; effects = []; result = api.useCiteTarget(attachmentId, pageIndex, visible); effects.splice(0).forEach(callback => callback()); }
    return result;
  }
  render();
  return { image, page, item, listeners, render,
    find(type) { return nodes(render().surface).find(node => node.type === type); },
    open() { const pending = render().open(); render(); return pending; },
    pop(input = {}) { for (const callback of [...(listeners.get('popstate') ?? [])]) if (listeners.get('popstate')?.has(callback)) callback(input); render(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
    get writesAfterUnmount() { return writesAfterUnmount; },
  };
}

test('a delayed source resolution cannot reopen a previous attachment after navigation', async () => {
  const h = fixture({ presentation: 'web', attachmentId: 'old' }), pending = h.open();
  h.render({ attachmentId: 'new' }); h.image[0].resolve('old-item'); await microtasks(); h.item[0]?.resolve(citation('old-item')); await pending;
  assert.equal(h.find('sheet'), undefined);
  const next = h.open(); h.image[1].resolve('new-item'); await microtasks(); h.item.at(-1).resolve(citation('new-item')); await next;
  const sheet = h.find('sheet'); assert.equal(sheet.props.item.id, 'new-item'); sheet.props.onClose(); assert.equal(h.find('sheet'), undefined); h.unmount();
});

test('MOBILE opens its Cite sheet synchronously before source reads finish and keeps the same sheet on success', async () => {
  const h = fixture(); assert.equal(h.image.length, 0); assert.equal(h.find('sheet'), undefined);
  const pending = h.open(), opening = h.find('sheet');
  assert.ok(opening, 'The first tap must present the sheet without waiting for a resolver.'); assert.equal(opening.props.item, null);
  assert.equal(opening.props.opening.error, ''); assert.equal(typeof opening.props.opening.onRetry, 'function'); assert.equal(typeof opening.props.onClose, 'function');
  assert.deepEqual(h.image[0].args, ['attachment']); assert.equal(h.item.length, 0);
  h.image[0].resolve('source-item'); await microtasks(); assert.equal(h.find('sheet').props.item, null);
  h.item[0].resolve(citation('source-item')); await pending;
  const ready = h.find('sheet'); assert.equal(ready.type, opening.type); assert.equal(ready.key, opening.key); assert.equal(ready.props.item.id, 'source-item');
  ready.props.onClose(); assert.equal(h.find('sheet'), undefined); h.unmount();
});

test('MOBILE failures stay inside the opened sheet and Retry resolves the current source', async () => {
  const h = fixture(), pending = h.open(); h.image[0].reject(new Error('Offline')); await pending;
  const failure = h.find('sheet'); assert.equal(failure.props.item, null); assert.equal(failure.props.opening.error, 'Citation could not be loaded. Check your connection and try again.');
  assert.equal(nodes(h.render().surface).some(node => node.props.role === 'alert'), false, 'The error belongs to the opened sheet rather than a detached page message.');
  failure.props.opening.onRetry(); h.render(); assert.equal(h.find('sheet').props.opening.error, ''); assert.deepEqual(h.image[1].args, ['attachment']);
  h.image[1].resolve('retried-source'); await microtasks(); h.item[0].resolve(citation('retried-source')); await microtasks();
  assert.equal(h.find('sheet').props.item.id, 'retried-source'); h.unmount();
});

test('MOBILE keeps its loading surface through image-to-page fallback and reports an unavailable item inline', async () => {
  const h = fixture({ pageIndex: 4 }), pending = h.open(); h.image[0].resolve('image-source'); await microtasks();
  h.item[0].resolve(null); await microtasks(); assert.deepEqual(h.page[0].args, ['attachment', 4]); assert.equal(h.find('sheet').props.item, null);
  h.page[0].resolve('page-source'); await microtasks(); h.item[1].resolve(citation('page-source')); await pending;
  assert.equal(h.find('sheet').props.item.id, 'page-source'); h.unmount();
  const unavailable = fixture(), absent = unavailable.open(); unavailable.image[0].resolve(null); await microtasks(); unavailable.page[0].resolve(null); await absent;
  assert.equal(unavailable.find('sheet').props.item, null); assert.equal(unavailable.find('sheet').props.opening.error, 'This item is unavailable for citation.'); unavailable.unmount();
});

test('MOBILE Close, Back, attachment/page changes and unmount reject late source success and failure', async () => {
  for (const cause of ['close', 'back', 'attachment', 'page', 'unmount']) for (const fails of [false, true]) {
    const h = fixture(), pending = h.open(); h.image[0].resolve('late-source'); await microtasks();
    assert.equal(h.item.length, 1); const input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    if (cause === 'close') h.find('sheet').props.onClose();
    else if (cause === 'back') h.pop(input);
    else if (cause === 'attachment') h.render({ attachmentId: 'new-attachment' });
    else if (cause === 'page') h.render({ pageIndex: 2 });
    else h.unmount();
    if (fails) h.item[0].reject(new Error('Delayed failure')); else h.item[0].resolve(citation('late-source')); await pending;
    if (cause !== 'unmount') { assert.equal(h.find('sheet'), undefined, `${cause} cannot allow a late request to reopen Cite`); assert.equal(nodes(h.render().surface).some(node => node.props.role === 'alert'), false); h.unmount(); }
    assert.equal(h.writesAfterUnmount, 0); assert.equal(h.listeners.size, 0); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined);
  }
});

test('MOBILE cancellation before the first await prevents further source reads', async () => {
  const h = fixture(), pending = h.open(); h.find('sheet').props.onClose(); h.image[0].resolve('stale-image'); await pending;
  assert.equal(h.item.length, 0); assert.equal(h.page.length, 0); assert.equal(h.find('sheet'), undefined); h.unmount();
});

test('MOBILE repeated taps let only the latest request populate or fail the opened sheet', async () => {
  for (const staleFails of [false, true]) {
    const h = fixture(), old = h.open(), latest = h.open(); assert.equal(nodes(h.render().surface).filter(node => node.type === 'sheet').length, 1);
    h.image[1].resolve('latest-source'); await microtasks(); h.item[0].resolve(citation('latest-source')); await latest;
    if (staleFails) h.image[0].reject(new Error('Old failure')); else h.image[0].resolve('old-source'); await old;
    const sheet = h.find('sheet'); assert.equal(sheet.props.item.id, 'latest-source'); assert.equal(sheet.props.opening?.error ?? '', ''); assert.equal(h.item.length, 1); h.unmount();
  }
});

test('changing presentation invalidates an outstanding MOBILE source resolution', async () => {
  const h = fixture(), pending = h.open(); h.render({ presentation: 'web' }); h.image[0].resolve('mobile-source'); await pending;
  assert.equal(h.find('sheet'), undefined); assert.equal(h.listeners.has('popstate'), false); h.unmount();
});

test('WEB retains deferred opening, original CiteSheet props and detached inline load errors', async () => {
  const h = fixture({ presentation: 'web' }), pending = h.open(); assert.equal(h.find('sheet'), undefined); assert.equal(h.listeners.has('popstate'), false);
  h.image[0].resolve('web-source'); await microtasks(); h.item[0].resolve(citation('web-source')); await pending;
  const sheet = h.find('sheet'); assert.equal(sheet.props.item.id, 'web-source'); assert.equal(sheet.props.opening, undefined); sheet.props.onClose(); assert.equal(h.find('sheet'), undefined);
  const failed = h.open(); h.image[1].reject(new Error('Offline')); await failed;
  assert.equal(h.find('sheet'), undefined); assert.equal(nodes(h.render().surface).find(node => node.props.role === 'alert').props.children, 'Citation could not be loaded.'); h.unmount();
});
