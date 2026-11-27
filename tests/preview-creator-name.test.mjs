import {motionFixture} from './helpers/motion-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function harness({ catalogueRow = false } = {}) {
  const refs = [], animations = [], observers = [], intersections = [];
  let cursor = 0, effect, cleanup, previousDeps, presentation = 'mobile', reducedMotion = false, active = false;
  const button = new EventTarget();
  button.matches = () => false;
  const attributes = new Set();
  const viewport = { clientWidth: 100,
    closest: selector => selector === 'button' ? button : null,
    toggleAttribute(name, enabled) { if (enabled) attributes.add(name); else attributes.delete(name); },
    setAttribute(name) { attributes.add(name); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); },
  };
  const text = { scrollWidth: 180, animate(frames, options) {
    const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  } };
  const react = { ...React,
    useRef() { const i = cursor++; return refs[i] ??= { current: null }; },
    useState() { return [active, value => { active = value; }]; },
    useLayoutEffect(callback, deps) {
      if (!previousDeps || deps.some((dep, i) => dep !== previousDeps[i])) effect = callback;
      previousDeps = deps;
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/PreviewCreatorName.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name.endsWith('/motion/motion')) return { ...motionFixture, reducedMotion: () => reducedMotion };
    if (name === 'react') return react;
    if (name === 'framer-motion') return { useReducedMotion: () => reducedMotion };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    throw Error(name);
  }, window: { matchMedia: () => ({ matches: true }) }, ResizeObserver: class {
    targets = []; disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }, IntersectionObserver: class {
    targets = []; disconnected = false;
    constructor(callback) { this.callback = callback; intersections.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  } });
  return { viewport, text, button, animations, observers, intersections,
    render(props = {}) {
      cursor = 0;
      const tree = catalogueRow
        ? exports.CatalogueRowName({ name: 'Portalink Networks Inc.', ...props })
        : exports.PreviewCreatorName({ name: 'Portalink Networks Inc.', active: true, ...props });
      refs[0].current = viewport;
      if (!catalogueRow) refs[1].current = text;
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
      return tree;
    },
    setPresentation(value) { presentation = value; },
    setReducedMotion(value) { reducedMotion = value; },
    unmount() { cleanup?.(); },
  };
}

test('desktop catalogue rows reveal on pointer hover or keyboard focus and restore their ellipsis on exit', () => {
  const h = harness({ catalogueRow: true });
  h.setPresentation('web');
  const label = () => h.render().props.children;
  assert.equal(label(), 'Portalink Networks Inc.');
  const enter = pointerType => h.button.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType }));
  enter('touch');
  assert.equal(label(), 'Portalink Networks Inc.');
  enter('mouse');
  const reveal = label().props;
  assert.equal(reveal.name, 'Portalink Networks Inc.');
  assert.ok(reveal.centered && reveal.animateOnWeb && reveal.fadeInset > 0);
  h.button.matches = selector => selector === ':focus-visible';
  h.button.dispatchEvent(new Event('focus'));
  h.button.dispatchEvent(new Event('pointerleave'));
  assert.equal(label().props.name, reveal.name);
  h.button.dispatchEvent(new Event('blur'));
  assert.equal(label(), reveal.name);
  h.button.dispatchEvent(new Event('focus'));
  assert.equal(label().props.name, reveal.name);
});

test('mobile and reduced-motion catalogue rows keep a static, fully named label', () => {
  const h = harness({ catalogueRow: true });
  for (const presentation of ['mobile', 'web']) {
    h.setPresentation(presentation);
    h.setReducedMotion(presentation === 'web');
    h.render();
    h.button.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }));
    const { title, children } = h.render().props;
    assert.equal(children, 'Portalink Networks Inc.');
    assert.equal(title, children);
  }
});

test('overflow starts revealing immediately and stops exactly at the end of the creator name', () => {
  const h = harness();
  h.render();
  assert.equal(h.viewport.hasAttribute('data-name-overflow'), true);
  assert.equal(h.animations.length, 1);
  assert.equal(h.intersections.length, 0, 'Existing labels start without waiting for intersection');
  const { frames, options } = h.animations[0];
  assert.equal(frames[0].transform, 'translateX(0)');
  assert.equal(frames.at(-1).transform, 'translateX(-80px)');
  assert.equal(options.delay, undefined);
  assert.equal(options.duration, 260);
  assert.equal(options.direction, 'alternate');
  assert.deepEqual(h.observers[0].targets, [h.viewport, h.text]);
  h.observers[0].callback();
  assert.equal(h.animations.length, 1, 'Unchanged measurements must not restart the text');
});

test('long Portal project titles paint unmasked until their visible row starts moving', () => {
  const h = harness();
  const title = h.render({ centered: true, visibleOnly: true, animatePosition: true, fadeInset: 8 });
  assert.equal(title.props.children.props.children, 'Portalink Networks Inc.');
  assert.match(title.props.children.props.className, /relative/);
  assert.equal(h.viewport.hasAttribute('data-name-animating'), false);
  assert.equal(h.animations.length, 0);
  const [visibility] = h.intersections;
  assert.deepEqual(visibility.targets, [h.viewport]);
  const setVisible = isIntersecting => visibility.callback([{ target: h.viewport, isIntersecting }]);
  setVisible(true);
  assert.equal(h.viewport.hasAttribute('data-name-overflow'), true);
  assert.equal(h.viewport.hasAttribute('data-name-animating'), true);
  assert.equal(h.animations.length, 1);
  const { frames, options } = h.animations[0];
  assert.equal(options.direction, 'alternate');
  assert.equal(options.duration, 96 / 22 * 1000 + 2400);
  assert.equal(frames[0].left, '8px');
  assert.equal(frames.at(-1).left, '-88px');
  assert.ok(frames.every(frame => !frame.transform), 'Avoid the composited transform under the modal mask');
  setVisible(false);
  assert.equal(h.viewport.hasAttribute('data-name-animating'), false);
  assert.equal(h.animations[0].cancelled, true);
  setVisible(true);
  assert.equal(h.animations.length, 2);
  h.unmount();
  assert.equal(h.viewport.hasAttribute('data-name-animating'), false);
  assert.equal(visibility.disconnected, true);
  assert.equal(h.animations[1].cancelled, true);
});

test('a reader without the animation API still renders the original Portal title', () => {
  const h = harness();
  h.text.animate = undefined;
  const title = h.render({ centered: true, visibleOnly: true, animatePosition: true, fadeInset: 8 });
  assert.equal(title.props.children.props.children, 'Portalink Networks Inc.');
  assert.equal(h.viewport.hasAttribute('data-name-animating'), false);
  assert.equal(h.observers.length, 0);
});

test('short names stay still; layout and font-size changes recalculate the hidden text', () => {
  const h = harness(); h.text.scrollWidth = 80;
  h.render(); assert.equal(h.animations.length, 0);
  h.viewport.clientWidth = 50; h.observers[0].callback();
  assert.equal(h.animations[0].frames.at(-1).transform, 'translateX(-30px)');
  h.text.scrollWidth = 120; h.observers[0].callback();
  assert.equal(h.animations[0].cancelled, true);
  assert.equal(h.animations[1].frames.at(-1).transform, 'translateX(-70px)');
  h.viewport.clientWidth = 140; h.observers[0].callback();
  assert.equal(h.animations[1].cancelled, true);
  assert.equal(h.animations.length, 2);
});

test('collapse and unmount stop animation; reopening or changing creator starts from the beginning', () => {
  const h = harness(); h.render();
  h.render({ active: false });
  assert.equal(h.animations[0].cancelled, true);
  assert.equal(h.observers[0].disconnected, true);
  h.render(); assert.equal(h.animations.length, 2);
  h.render({ name: 'Another creator with a long name' });
  assert.equal(h.animations[1].cancelled, true);
  assert.equal(h.animations.length, 3);
  h.unmount();
  assert.equal(h.animations[2].cancelled, true);
  assert.equal(h.observers.at(-1).disconnected, true);
});

test('reduced motion wraps the full name while WEB retains its existing static label', () => {
  const h = harness(); h.render(); h.setReducedMotion(true);
  const mobile = h.render();
  assert.equal(h.animations[0].cancelled, true);
  assert.match(mobile.props.className, /whitespace-normal/);
  assert.equal(mobile.props.children.props.children, 'Portalink Networks Inc.');
  h.setReducedMotion(false); h.setPresentation('web');
  const web = h.render();
  assert.match(web.props.className, /truncate/);
  assert.equal(web.props.children, 'Portalink Networks Inc.');
  assert.equal(h.animations.length, 1);
});

test('connection names pause at both ends and move at a reading pace', () => {
  const h = harness(); const tree = h.render({ centered: true, className: 'block w-full [font:inherit]' });
  assert.match(tree.props.className, /\[font:inherit\]/);
  assert.doesNotMatch(tree.props.className, /text-\[11px\]/);
  assert.equal(tree.props['data-name-centered'], '');
  const { frames, options } = h.animations[0];
  assert.equal(options.duration, 80 / 22 * 1000 + 2400);
  assert.equal(frames[0].transform, frames[1].transform);
  assert.equal(frames[2].transform, frames[3].transform);
  assert.equal(frames[1].offset * options.duration, 1200);
  assert.equal(options.easing, 'linear');
  assert.equal(frames[1].easing, 'ease-in-out');
  h.observers[0].callback(); assert.equal(h.animations.length, 1);
  h.setReducedMotion(true); const reduced = h.render({ centered: true, className: 'block w-full [font:inherit]' });
  assert.equal(h.animations[0].cancelled, true);
  assert.equal(reduced.props['data-name-reduced-motion'], '');
  assert.match(reduced.props.className, /whitespace-normal/);
  assert.match(reduced.props.className, /\[font:inherit\]/);
});

test('short connection names remain centered and still; desktop stays unchanged', () => {
  const h = harness(); h.text.scrollWidth = 80;
  assert.equal(h.render({ centered: true }).props['data-name-centered'], '');
  assert.equal(h.animations.length, 0);
  h.setPresentation('web');
  assert.equal(h.render({ centered: true }).props['data-name-centered'], undefined);
});

test('desktop Portal titles opt into the same motion and keep the complete text with reduced motion', () => {
  const h = harness();
  h.setPresentation('web');
  const options = { animateOnWeb: true, centered: true, fadeInset: 12 };
  h.render(options);
  const [animation] = h.animations;
  assert.equal(animation.options.direction, 'alternate');
  assert.equal(animation.frames[0].transform, 'translateX(12px)');
  assert.equal(animation.frames.at(-1).transform, 'translateX(-92px)');
  h.setReducedMotion(true);
  const reduced = h.render(options);
  assert.equal(animation.cancelled, true);
  assert.match(reduced.props.className, /whitespace-normal/);
  assert.equal(reduced.props.children.props.children, 'Portalink Networks Inc.');
});
