import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import postcss from 'postcss';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function harness() {
  const listeners = new Map(), registrations = [], removals = [], slots = [], pending = [];
  let cursor = 0;
  class Element {
    constructor(tag = 'div', parent = null, presentation = undefined, userSelect = 'none') {
      Object.assign(this, { tag, parent, presentation, userSelect });
    }
    closest(selector) {
      for (let element = this; element; element = element.parent) {
        if (selector === '[data-presentation="mobile"]' ? element.presentation === 'mobile' : selector.split(',').map(part => part.trim()).includes(element.tag)) return element;
      }
      return null;
    }
  }
  const document = {
    addEventListener(name, callback, capture) {
      registrations.push({ name, capture });
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback, capture) {
      removals.push({ name, capture });
      assert.equal(capture, true);
      assert.ok(listeners.get(name)?.delete(callback), 'Cleanup removes its own registered listener');
      if (!listeners.get(name).size) listeners.delete(name);
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('src/presentation/mobile/useMobileSelectionBoundary.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, document, Element,
    getComputedStyle(element) { assert.ok(element instanceof Element); return { userSelect: element.userSelect }; },
    require(name) {
      assert.equal(name, 'react');
      return { useEffect(effect, deps) {
        const index = cursor++, previous = slots[index];
        if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
          pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
        }
      } };
    },
  });
  function dispatch(name, target, { cancelable = true, bubble } = {}) {
    const event = { target, cancelable, defaultPrevented: false, prevented: 0, stopped: 0,
      preventDefault() { this.prevented++; if (this.cancelable) this.defaultPrevented = true; },
      stopPropagation() { this.stopped++; }, stopImmediatePropagation() { this.stopped++; },
    };
    for (const callback of [...listeners.get(name) ?? []]) callback(event);
    if (!event.stopped) bubble?.(event);
    return event;
  }
  return { Element, listeners, registrations, removals, dispatch,
    render(presentation) { cursor = 0; exports.useMobileSelectionBoundary(presentation); pending.splice(0).forEach(effect => effect()); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; },
  };
}

test('WEB never registers native menu blockers; mobile has one pair through rerenders and cleans up across modes', () => {
  const h = harness();
  h.render('web'); assert.equal(h.listeners.size, 0);
  h.render('mobile'); h.render('mobile'); h.render('mobile');
  assert.deepEqual(h.registrations, [{ name: 'contextmenu', capture: true }, { name: 'dragstart', capture: true }]);
  assert.equal(h.listeners.get('contextmenu').size, 1);
  assert.equal(h.listeners.get('dragstart').size, 1);
  h.render('web'); assert.equal(h.listeners.size, 0); assert.equal(h.removals.length, 2);
  h.render('mobile'); assert.equal(h.listeners.size, 2);
  h.dispose(); assert.equal(h.listeners.size, 0); assert.equal(h.removals.length, 4);
});

test('main and body-portalled mobile UI suppress native menus without changing WEB or outside content', () => {
  const h = harness(); h.render('mobile');
  const body = new h.Element('body'), main = new h.Element('main', body, 'mobile');
  const portal = new h.Element('section', body, 'mobile'), web = new h.Element('main', body, 'web');
  for (const target of [main, new h.Element('h2', main), new h.Element('span', portal)]) {
    const event = h.dispatch('contextmenu', target);
    assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, 0);
  }
  for (const target of [body, new h.Element('img', web), {}, null]) assert.equal(h.dispatch('contextmenu', target).prevented, 0);
});

test('selectable descriptions, nested prose and text inputs retain their native text menu', () => {
  const h = harness(); h.render('mobile');
  const root = new h.Element('main', null, 'mobile');
  for (const tag of ['div', 'p', 'strong', 'input', 'textarea', 'span']) {
    const text = new h.Element(tag, root, undefined, 'text');
    assert.equal(h.dispatch('contextmenu', text).defaultPrevented, false, `${tag} permits CSS-opted-in selection`);
    assert.equal(h.dispatch('dragstart', text).defaultPrevented, false, 'Native text dragging is unchanged');
  }
  const content = new h.Element('p', root, undefined, 'none');
  assert.equal(h.dispatch('contextmenu', content).defaultPrevented, true);
  content.userSelect = 'text';
  assert.equal(h.dispatch('contextmenu', content).defaultPrevented, false, 'The current CSS policy is read for each event');
});

test('artwork menus and native image drags stay blocked inside selectable descriptions, including SVG descendants', () => {
  const h = harness(); h.render('mobile');
  const root = new h.Element('main', null, 'mobile'), description = new h.Element('div', root, undefined, 'text');
  for (const tag of ['img', 'picture', 'video', 'canvas', 'svg']) {
    const media = new h.Element(tag, description, undefined, 'text');
    for (const target of [media, new h.Element('path', media, undefined, 'text')]) {
      assert.equal(h.dispatch('contextmenu', target).defaultPrevented, true, `${tag} callout stays suppressed`);
      assert.equal(h.dispatch('dragstart', target).defaultPrevented, true, `${tag} does not begin a native drag`);
    }
  }
});

test('native cancellation preserves custom context actions and pointer-based reorder gestures', () => {
  const h = harness(); h.render('mobile');
  const target = new h.Element('span', new h.Element('main', null, 'mobile'));
  let customContextCalls = 0, pointerCalls = 0;
  const event = h.dispatch('contextmenu', target, { bubble(received) {
    customContextCalls++; assert.equal(received.defaultPrevented, true);
  } });
  assert.equal(customContextCalls, 1); assert.equal(event.stopped, 0);
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'selectstart']) {
    const pointer = h.dispatch(name, target, { bubble() { pointerCalls++; } });
    assert.equal(pointer.prevented, 0); assert.equal(pointer.stopped, 0);
  }
  assert.equal(pointerCalls, 6);
  assert.equal(h.dispatch('dragstart', target).defaultPrevented, false, 'Only native media drags are canceled');
});

test('noncancelable events and events after unmount are left alone', () => {
  const h = harness(); h.render('mobile');
  const target = new h.Element('img', new h.Element('main', null, 'mobile'));
  for (const name of ['contextmenu', 'dragstart']) {
    assert.equal(h.dispatch(name, target, { cancelable: false }).prevented, 0);
  }
  h.dispose();
  assert.equal(h.dispatch('contextmenu', target).prevented, 0);
  assert.equal(h.dispatch('dragstart', target).prevented, 0);
});

test('shared selection styles are mobile-scoped and limit exceptions to prose and editable fields', () => {
  const css = postcss.parse(read('src/presentation/mobile/selection.css'));
  const rules = [];
  css.walkRules(rule => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith("[data-presentation='mobile']"), selector);
    rules.push(rule);
  });
  assert.ok(rules.length >= 3);
  const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  assert.equal(declarations(rules[0])['user-select'], 'none');
  assert.equal(declarations(rules[0])['-webkit-touch-callout'], 'none');
  const selectable = rules.find(rule => declarations(rule)['user-select'] === 'text');
  assert.ok(selectable, 'Reading and editing have a selection exception');
  for (const name of ['.project-description-body', '.follow-info-description', '[data-project-hover-description]', '.project-description-text', '.mobile-review-summary', '.text-format-preview', 'input', 'textarea', '[contenteditable]']) assert.ok(selectable.selector.includes(name), name);
  for (const type of ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']) assert.ok(selectable.selector.includes(`[type='${type}']`), `${type} is excluded from text inputs`);
  assert.doesNotMatch(selectable.selector, /\.formatted-text|data-message-bubble|data-studio-row/);
  assert.equal(declarations(selectable)['-webkit-touch-callout'], 'default');
  const media = rules.at(-1);
  for (const tag of ['img', 'picture', 'video', 'canvas', 'svg']) assert.ok(media.selector.includes(tag));
  assert.equal(declarations(media)['user-select'], 'none');
  assert.equal(declarations(media)['-webkit-touch-callout'], 'none');
  assert.equal(declarations(media)['-webkit-user-drag'], 'none');
  css.walkDecls(decl => assert.ok(!['pointer-events', 'touch-action', 'display', 'visibility'].includes(decl.prop), 'The selection policy does not change hit testing, scrolling or visibility'));
});
