import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const placeholder = new Proxy({}, { get: (_target, key) => key });
function load(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: imports, ...globals });
  return exports;
}
const place = (name, id, extra = {}) => ({ id: `gn-${id}`, name, kind: 'city', countryCode: 'US', countryName: 'United States', regionName: 'California', ...extra });
const sample = [place('Oakland', 1), place('Oakley', 2), place('Oakhurst', 3), place('Oak Park', 4), place('Oakdale', 5)];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness(search = async () => sample, initial = {}) {
  const slots = [], effects = [], timers = new Map(), calls = [], selected = [];
  let cursor = 0, dirty = true, tree, timerId = 0, focused = 0;
  let props = { id: 'location', label: 'Find a place', value: '', onChange(value) { props.value = value; dirty = true; }, onSelect(value) { selected.push(value); }, ...initial };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React, useId: () => 'generated',
    useState(initialValue) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; } }];
    },
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(effect, deps) {
      const index = cursor++, before = slots[index];
      if (before && equal(before.deps, deps)) return;
      const slot = slots[index] = { deps };
      effects.push(() => { before?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  const { LocationSearch } = load('src/components/profile/LocationSearch.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/locationDirectory')) return { locationDirectory: { search(value) { calls.push(value); return search(value); } } };
    return placeholder;
  }, { window: { setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } } });
  const render = () => {
    for (let count = 0; dirty && count < 20; count++) {
      dirty = false; cursor = 0; tree = LocationSearch(props);
      nodes(tree).find(node => node.type === 'input').ref.current = { focus() { focused++; } };
      effects.splice(0).forEach(effect => effect());
    }
    assert.equal(dirty, false, 'Search settles after effects');
    return tree;
  };
  const input = () => nodes(render()).find(node => node.type === 'input');
  return {
    render, input, calls, selected, timers,
    get focused() { return focused; },
    change(value) { input().props.onChange({ target: { value } }); render(); },
    focus() { input().props.onFocus(); render(); },
    options() { return nodes(render()).filter(node => node.props.role === 'option'); },
    key(key, composing = false) {
      const event = { key, nativeEvent: { isComposing: composing }, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      input().props.onKeyDown(event); render(); return event;
    },
    setProps(next) { props = { ...props, ...next }; dirty = true; render(); },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    async flush() { for (let count = 0; count < 8; count++) { await Promise.resolve(); render(); } },
    async search(value) { this.change(value); this.runTimers(); await this.flush(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('the shared location combobox debounces requests and selects a named destination', async () => {
  const h = harness();
  assert.equal(h.input().props.role, 'combobox');
  assert.ok(nodes(h.render()).some(node => node.type === 'label' && node.props.htmlFor === h.input().props.id));
  h.change('Oa'); h.change('Oak');
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 1);
  h.runTimers(); await h.flush();
  assert.deepEqual(h.calls, ['Oak']);
  assert.equal(h.options()[0].props.id, h.input().props['aria-activedescendant']);
  h.options()[0].props.onClick();
  assert.deepEqual(h.selected, [sample[0]]);
  assert.equal(h.input().props['aria-expanded'], false);
});

test('keyboard selection respects composition, prevents form submission and closes on Escape', async () => {
  const h = harness(); await h.search('Oak');
  assert.equal(h.key('ArrowDown').prevented, true);
  assert.equal(h.options()[1].props['aria-selected'], true);
  assert.equal(h.key('Enter', true).prevented, false);
  assert.equal(h.selected.length, 0);
  assert.equal(h.key('Enter').prevented, true);
  assert.deepEqual(h.selected, [sample[1]]);
  h.focus(); h.runTimers(); await h.flush();
  const escape = h.key('Escape');
  assert.equal(escape.prevented, true); assert.equal(escape.stopped, true);
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.key('Escape').prevented, false, 'A second Escape can dismiss the surrounding surface');
  assert.equal(h.key('Enter').prevented, false, 'Closed search does not swallow form submission');
});

test('unmatched locations have feedback, remain editable, and dismiss on outside blur', async () => {
  const h = harness(async () => []); await h.search('Unlisted place');
  assert.equal(h.options().length, 0);
  assert.equal(h.input().props['aria-activedescendant'], undefined);
  assert.match(nodes(h.render()).find(node => node.props.role === 'status').props.children, /No matching locations/);
  assert.equal(h.key('Enter').prevented, true);
  assert.equal(h.selected.length, 0);
  h.render().props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} });
  assert.equal(h.input().props['aria-expanded'], true, 'Moving focus to retry/attribution stays inside');
  h.render().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null });
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.input().props.value, 'Unlisted place', 'Blur never overwrites custom text');
  h.change(''); assert.equal(h.input().props.value, ''); assert.equal(h.timers.size, 0);
});

test('late search results cannot replace newer input or reopen a disabled/closed field', async () => {
  const first = deferred(), second = deferred();
  const h = harness(value => value === 'Old' ? first.promise : second.promise);
  h.change('Old'); h.runTimers(); h.change('New'); h.runTimers();
  second.resolve([place('New place', 7)]); await h.flush();
  first.resolve([place('Old place', 6)]); await h.flush();
  assert.equal(h.options()[0].props.children[0].props.children[0], 'New place');
  h.setProps({ disabled: true });
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.input().props.value, 'New');
  h.unmount(); assert.equal(h.timers.size, 0);
});

test('a failed search retries and returns focus to the input without changing saved text', async () => {
  let attempts = 0;
  const h = harness(async () => { if (++attempts === 1) throw Error('Offline'); return sample; }, { value: 'Existing place' });
  h.focus(); h.runTimers(); await h.flush();
  const retry = nodes(h.render()).find(node => node.type === 'button' && node.props.children === 'Try again');
  assert.ok(retry); assert.equal(retry.props.type, 'button');
  retry.props.onClick(); h.render(); h.runTimers(); await h.flush();
  assert.equal(h.focused, 1); assert.equal(h.input().props.value, 'Existing place');
  assert.equal(h.options().length, sample.length); assert.equal(h.selected.length, 0);
});

test('unselectable long names are identified and cannot replace the profile value', async () => {
  const long = place('A'.repeat(60), 9);
  const h = harness(async () => [long, sample[0]], { maxLength: 48, canSelect: item => item.name.length <= 48, value: 'Existing place' });
  h.focus(); h.runTimers(); await h.flush();
  assert.equal(h.input().props.maxLength, 48);
  assert.equal(h.options()[0].props['aria-disabled'], true);
  h.options()[0].props.onClick(); h.key('Enter');
  assert.equal(h.selected.length, 0); assert.equal(h.input().props.value, 'Existing place');
  h.key('ArrowDown'); h.key('Enter'); assert.deepEqual(h.selected, [sample[0]]);
});

test('keyboard selection scrolls only its suggestion list to keep the active location visible', async () => {
  const h = harness(); await h.search('Oak');
  let active = 0;
  const popup = { scrollTop: 0, clientHeight: 166, querySelector: () => ({ offsetTop: active * 40, offsetHeight: 40 }) };
  nodes(h.render()).find(node => node.props.role === 'listbox').ref.current = popup;
  for (active = 1; active <= 4; active++) h.key('ArrowDown');
  assert.equal(popup.scrollTop, 34);
  for (active = 3; active >= 0; active--) h.key('ArrowUp');
  assert.equal(popup.scrollTop, 0);
});

test('WEB and MOBILE expose the same directory search while retaining their globe dimensions', () => {
  for (const presentation of ['web', 'mobile']) {
    let cursor = 0; const slots = [], visits = [], viewportEnabled = [];
    const react = { ...React, useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
      useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; } };
    const { PortalinkPage } = load('src/components/PortalinkPage.tsx', name => {
      if (name === 'react') return react;
      if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
      if (name.endsWith('/locationDirectory')) return { placeLabel: place => `${place.name}, ${place.regionName}, ${place.countryCode}` };
      if (name.endsWith('/useDialogViewport')) return { useDialogViewport: enabled => { viewportEnabled.push(enabled); return { current: null }; } };
      if (name.endsWith('/ServicesContext')) return { useServices: () => ({ geography: { readLocalGeography: () => ({ cities: [] }) } }) };
      if (name.endsWith('/CityGlobe')) return { buildLandPaths: () => [], buildPolarCaps: () => [], isNightAt: () => false, GLOBE_ATMOSPHERE: {}, GLOBE_COLORS: {}, LAND_TONES_DAY: [], LAND_TONES_NIGHT: [], GLOBE_CENTER: 52, GLOBE_RADIUS: 50 };
      return placeholder;
    });
    const render = () => { cursor = 0; return PortalinkPage({ onBack() {}, onSelectCity: item => visits.push(item), live: {} }); };
    const search = () => nodes(render()).find(node => node.type === 'LocationSearch');
    assert.equal(search().props.label, 'Find a place'); assert.equal(search().props.above, true);
    search().props.onChange('Oak'); assert.equal(search().props.value, 'Oak');
    search().props.onSelect(sample[0]); assert.deepEqual(visits, [sample[0]]);
    assert.equal(search().props.value, 'Oakland, California, US');
    const globe = nodes(render()).find(node => node.props.role === 'group');
    assert.match(globe.props.className, presentation === 'mobile' ? /w-full max-w-\[min\(72vh,720px\)\]/ : /100cqw,100cqh,720px/);
    assert.equal(nodes(render()).some(node => node.props.style?.containerType === 'size'), presentation === 'web');
    assert.ok(viewportEnabled.every(enabled => enabled === (presentation === 'mobile')));
    const done = nodes(render()).find(node => node.props.className === 'portalink-search-done');
    assert.equal(Boolean(done), false);
    assert.equal(search().props.blurOnSelect, presentation === 'mobile');
    if (done) { let blurred = false; done.props.onClick({ currentTarget: { blur() { blurred = true; } } }); assert.equal(blurred, true); }
  }
});
