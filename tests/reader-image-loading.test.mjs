import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];

/** Exercise the actual page's observer, load/error events, retry and timeout.
 * Browser QA separately establishes whether hidden native-lazy images request.
 */
function pageHarness({ isMobile = false, pageNumber = 7, priorityCount = 6, isFocused = false, observer = true } = {}) {
  const slots = [], effects = [], observers = [], timers = new Map();
  let cursor = 0, dirty = true, tree, nextTimer = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (run, deps) => {
    const index = cursor++, prior = slots[index];
    if (!same(prior?.deps, deps)) {
      slots[index] = { deps };
      effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); });
    }
  };
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }];
    },
    useEffect: effect, useLayoutEffect: effect,
  };
  const attachment = { id: 'image-7', sourceUrl: '/reader-image-7.jpg', displayName: 'Image seven', metadata: { widthPixels: 600, heightPixels: 900 } };
  const host = { scrollTop: 0, scrollLeft: 0, querySelector: () => null };
  const exports = {}, props = { projectId: 'project', attachment, pageNumber, pageCount: 32, priorityCount, isMobile, isFocused, onToggleFocus() {} };
  const source = readFileSync(new URL('../src/components/media/ImageAttachment.tsx', import.meta.url), 'utf8') + '\nexport { ImagePage };';
  const Observer = class {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, URLSearchParams,
    window: { setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; }, clearTimeout(id) { timers.delete(id); } },
    ...(observer ? { IntersectionObserver: Observer } : {}),
    require(name) {
      if (name === 'react') return react;
      if (name === '../ui/ResponsiveImage') return { ResponsiveImage: 'reader-image' };
      if (name === '../ui/StateViews') return { ErrorState: 'error-state' };
      if (name === './useMobileMediaRecovery') return { useMobileMediaRecovery: () => () => {} };
      return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : `stub-${String(key)}` });
    },
  });
  const flush = () => {
    for (let count = 0; dirty && count < 20; count++) {
      cursor = 0; dirty = false; tree = exports.ImagePage(props); tree.ref.current = host;
      while (effects.length) effects.shift()();
    }
    assert.equal(dirty, false, 'page settles without an effect loop');
  };
  return {
    flush, timers, observers,
    get tree() { return tree; },
    get image() { return nodes(tree).find(node => node.type === 'reader-image'); },
    get error() { return nodes(tree).find(node => node.type === 'error-state'); },
    intersect(near) { observers.at(-1).callback([{ isIntersecting: near }]); flush(); },
    timeout() { const pending = [...timers.values()]; timers.clear(); for (const timer of pending) timer.callback(); flush(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

for (const isMobile of [false, true]) test(`${isMobile ? 'MOBILE' : 'WEB'} later pages wait outside the observer margin, then load without hidden/native-lazy gating`, () => {
  const h = pageHarness({ isMobile }); h.flush();
  assert.equal(h.image, undefined, 'distant pages expose no image source');
  assert.equal(h.timers.size, 0, 'distant pages do not time out before becoming eligible');
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].options.rootMargin, '1200px 0px');
  h.intersect(false);
  assert.equal(h.image, undefined);
  h.intersect(true);
  assert.equal(h.image.props.src, '/reader-image-7.jpg');
  assert.equal(h.image.props.loading, 'eager', 'a hidden image must request once its page is eligible');
  assert.equal(h.image.props.priority, false, 'nearby pages are not promoted to high network priority');
  assert.match(h.image.props.className, /hidden/);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 30_000);
  h.image.props.onLoad(); h.flush();
  assert.equal(h.tree.props['data-project-page-ready'], true);
  assert.match(h.image.props.className, /premium-media-ready/);
  assert.doesNotMatch(h.image.props.className, /hidden/);
  assert.equal(h.timers.size, 0, 'successful load cancels the failure deadline');
  assert.equal(h.tree.props.style.aspectRatio, '600 / 900');
  h.dispose();
});

test('only the first authored row is prioritized; later focused WEB pages still load', () => {
  for (const pageNumber of [1, 6]) {
    const h = pageHarness({ pageNumber }); h.flush();
    assert.equal(h.image.props.priority, true);
    assert.equal(h.image.props.loading, 'eager');
    assert.equal(h.observers.length, 0);
    h.dispose();
  }
  const focused = pageHarness({ pageNumber: 7, priorityCount: 1, isFocused: true }); focused.flush();
  focused.intersect(true);
  assert.equal(focused.image.props.loading, 'eager');
  assert.equal(focused.image.props.priority, false);
  focused.image.props.onLoad(); focused.flush();
  assert.equal(focused.tree.props['data-project-page-ready'], true);
  focused.dispose();
});

for (const failure of ['error', 'timeout']) test(`a later WEB page can retry after ${failure} without changing source, geometry or priority`, () => {
  const h = pageHarness(); h.flush(); h.intersect(true);
  const firstKey = h.image.key, source = h.image.props.src;
  if (failure === 'error') { h.image.props.onError(); h.flush(); }
  else h.timeout();
  assert.equal(h.image, undefined);
  assert.equal(h.error.props.title, 'This image could not be displayed');
  assert.equal(h.timers.size, 0);
  h.error.props.onRetry(); h.flush();
  assert.notEqual(h.image.key, firstKey, 'manual retry creates a fresh image element');
  assert.equal(h.image.props.src, source);
  assert.equal(h.image.props.loading, 'eager');
  assert.equal(h.image.props.priority, false);
  assert.equal(h.tree.props.style.aspectRatio, '600 / 900');
  h.image.props.onLoad(); h.flush();
  assert.equal(h.tree.props['data-project-page-ready'], true);
  assert.equal(h.timers.size, 0);
  h.dispose();
});

test('browsers without IntersectionObserver can still load a nonpriority WEB image', () => {
  const h = pageHarness({ observer: false }); h.flush();
  assert.equal(h.image.props.loading, 'eager');
  assert.equal(h.image.props.priority, false);
  h.image.props.onLoad(); h.flush();
  assert.equal(h.tree.props['data-project-page-ready'], true);
  h.dispose();
});
