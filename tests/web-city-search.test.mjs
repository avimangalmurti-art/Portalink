import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const cityData = [
  { name: 'London', longitude: -0.13, latitude: 51.51 },
  { name: 'Paris', longitude: 2.35, latitude: 48.86 },
  { name: 'Cape Town', longitude: 18.42, latitude: -33.92 },
  { name: 'Cairo', longitude: 31.24, latitude: 30.04 },
  { name: 'Athens', longitude: 23.73, latitude: 37.98 },
  { name: 'Madrid', longitude: -3.7, latitude: 40.42 },
];
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
function harness(presentation = 'web') {
  let cursor = 0, focused = 0;
  const slots = [], visits = [], effects = [];
  const react = { ...React, useEffect(effect) { effects.push(effect); }, useId: () => 'city-search', useMemo: fn => fn(),
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/PortalinkPage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ geography: { readLocalGeography: () => ({ cities: cityData }) } }) };
    if (name.endsWith('/cities')) return { cities: cityData };
    if (name.endsWith('/countryCodes')) return { getCountryCode: () => 'GB' };
    if (name.endsWith('/CityGlobe')) return {
      buildLandPaths: () => [], buildPolarCaps: () => [], isNightAt: () => false, getLocalTimeAt: () => '12:00:00',
      GLOBE_ATMOSPHERE: {}, GLOBE_COLORS: {}, LAND_TONES_DAY: [], LAND_TONES_NIGHT: [], GLOBE_CENTER: 52, GLOBE_RADIUS: 50,
    };
    return new Proxy({}, { get: (_target, key) => key });
  } });
  function render() { cursor = 0; effects.length = 0; return exports.PortalinkPage({ onBack() {}, onSelectCity: city => visits.push(city.name), live: {} }); }
  const input = () => nodes(render()).find(node => node.type === 'input');
  return { render, visits, input, runEffects() { effects.forEach(effect => effect()); },
    search(value) { input().props.onChange({ target: { value } }); },
    options: () => nodes(render()).filter(node => node.props.role === 'option'),
    key(key, composing = false) { const event = { key, nativeEvent: { isComposing: composing }, prevented: false, preventDefault() { this.prevented = true; } }; input().props.onKeyDown(event); return event; },
    clear() { input().ref.current = { focus() { focused++; } }; nodes(render()).find(node => node.props['aria-label'] === 'Clear city search').props.onClick(); },
    get focused() { return focused; },
  };
}

test('WEB city search selects an exact named destination without relying on overlapping globe targets', () => {
  const h = harness();
  assert.equal(h.input().props.role, 'combobox');
  assert.ok(nodes(h.render()).some(node => node.type === 'label' && node.props.htmlFor === h.input().props.id && node.props.children === 'Find a city'));
  h.search('  lon  ');
  assert.equal(h.options().length, 1);
  assert.equal(h.options()[0].props.id, h.input().props['aria-activedescendant']);
  h.options()[0].props.onClick();
  assert.deepEqual(h.visits, ['London']);
  assert.equal(h.input().props['aria-expanded'], false);
});

test('arrow keys and Enter choose the active result, while Escape closes without navigating', () => {
  const h = harness(); h.search('ca');
  assert.equal(h.options().length, 2);
  assert.equal(h.options()[0].props['aria-selected'], true);
  assert.equal(h.key('ArrowDown').prevented, true);
  assert.equal(h.options()[1].props['aria-selected'], true);
  h.key('Enter', true); assert.deepEqual(h.visits, [], 'Composition Enter must not navigate');
  h.key('Enter'); assert.deepEqual(h.visits, ['Cairo']);
  h.search('ca'); h.key('Escape');
  assert.equal(h.input().props['aria-expanded'], false);
  h.key('Enter'); assert.deepEqual(h.visits, ['Cairo']);
  h.key('ArrowDown'); assert.equal(h.options()[0].props['aria-selected'], true);
  h.key('ArrowUp'); assert.equal(h.options()[0].props['aria-selected'], true);
});

test('unmatched cities have feedback and a usable clear action; leaving search dismisses its popup', () => {
  const h = harness(); h.search('not-a-city');
  assert.equal(h.options().length, 0);
  assert.equal(h.input().props['aria-activedescendant'], undefined);
  assert.ok(nodes(h.render()).some(node => node.props.role === 'status'));
  h.key('Enter'); assert.deepEqual(h.visits, []);
  h.clear(); assert.equal(h.input().props.value, ''); assert.equal(h.focused, 1);
  h.search('par');
  nodes(h.render()).find(node => node.props.onBlur).props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(h.input().props['aria-expanded'], false);
});

test('MOBILE keeps its existing globe sizing and has no desktop search surface', () => {
  const mobile = harness('mobile'), web = harness();
  assert.equal(mobile.input(), undefined);
  assert.equal(mobile.options().length, 0);
  const globe = h => nodes(h.render()).find(node => node.props.role === 'group');
  assert.match(globe(mobile).props.className, /w-full max-w-\[min\(72vh,720px\)\]/);
  assert.match(globe(web).props.className, /100cqw,100cqh,720px/);
  assert.ok(nodes(web.render()).some(node => node.props.style?.containerType === 'size'));
  assert.equal(nodes(mobile.render()).some(node => node.props.style?.containerType === 'size'), false);
});

test('keyboard selection scrolls only the suggestion popup enough to keep its active city visible', () => {
  const h = harness(); h.search('a');
  assert.equal(h.options().length, 5);
  let activeIndex = 0;
  const popup = {
    scrollTop: 0, clientTop: 1, clientHeight: 166,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 105 + activeIndex * 40 - popup.scrollTop, bottom: 145 + activeIndex * 40 - popup.scrollTop }) }),
  };
  nodes(h.render()).find(node => node.ref && node.props.className?.includes('bottom-full')).ref.current = popup;
  h.runEffects(); assert.equal(popup.scrollTop, 0, 'An already visible option should not scroll');
  for (let index = 1; index <= 4; index++) {
    h.key('ArrowDown'); h.render(); activeIndex = index; h.runEffects();
  }
  assert.equal(popup.scrollTop, 38, 'The final row must be fully visible in a short popup');
  for (let index = 3; index >= 0; index--) {
    h.key('ArrowUp'); h.render(); activeIndex = index; h.runEffects();
  }
  assert.equal(popup.scrollTop, 4, 'Moving back up scrolls only as far as needed');
  h.key('Escape'); h.render(); activeIndex = 4; h.runEffects();
  assert.equal(popup.scrollTop, 4, 'A closed popup must not scroll');
  const mobile = harness('mobile'); mobile.render(); mobile.runEffects();
  assert.equal(mobile.options().length, 0);
});
