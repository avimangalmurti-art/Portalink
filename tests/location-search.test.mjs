import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const london = { id: 'city-2643743', kind: 'city', name: 'London', regionName: 'England', countryName: 'United Kingdom' };
const paris = { id: 'city-2988507', kind: 'city', name: 'Paris', regionName: 'Île-de-France', countryName: 'France' };
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const textOf = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textOf).join('') : String(node ?? '');

// Run the actual component with controlled React effects and search completions.
// This verifies interaction/state behavior; it is not browser layout evidence.
function harness(overrides = {}, { profilePicker = false } = {}) {
  const slots = [], requests = [], changes = [], selected = [], timers = new Map();
  let cursor = 0, dirty = true, tree, effects = [], deferredEffects = [], now = 0, nextTimer = 0, focused = 0, blurred = 0;
  const focusOptions = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useId: () => 'location-search',
    useState(initial) {
      const i = cursor++;
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const { LocationSearch } = sourceModule('src/components/profile/LocationSearch.tsx', {
    react,
    '../../data/locationDirectory': { locationDirectory: { search(query) {
      const response = deferred(); requests.push({ query, ...response }); return response.promise;
    } } },
    './locationSearch.css': {},
  }, { window: {
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
  } });
  const ProfileLocationPicker = profilePicker ? sourceModule('src/components/profile/ProfileLocationPicker.tsx', {
    react,
    './LocationSearch': { LocationSearch },
    '../../data/locationDirectory': sourceModule('src/data/locationDirectory.ts', {
      './cities': { cities: [] }, './countryCodes': { getCountryCode() { return ''; } },
      '../utils/location': { toLocationId: value => value },
      './locationDirectoryVersion': { LOCATION_DIRECTORY_MANIFEST: '/unused-fixture-manifest.json' },
    }),
    '../../features/profile/validation': { LOCATION_MAX_LENGTH: 48 },
  }).ProfileLocationPicker : null;
  const props = { label: 'Location', value: '', onChange(value) { changes.push(value); props.value = value; dirty = true; }, onSelect(place) { selected.push(place); }, ...overrides };
  const inputElement = {
    focus(options) { focused++; focusOptions.push(options); nodes(tree).find(node => node.type === 'input').props.onFocus(); },
    blur() { blurred++; tree.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }); },
  };
  const listElement = { scrollTop: 0, clientHeight: 160, querySelector() { return null; } };
  function renderPass() {
    cursor = 0; dirty = false; effects = [];
    tree = LocationSearch(ProfileLocationPicker ? ProfileLocationPicker(props).props.children.props : props);
    nodes(tree).find(node => node.type === 'input').ref.current = inputElement;
    const listbox = nodes(tree).find(node => node.props.role === 'listbox');
    if (listbox) listbox.ref.current = listElement;
  }
  function render() {
    for (const effect of deferredEffects.splice(0)) effect();
    for (let pass = 0; dirty; pass++) {
      assert.ok(pass < 20, 'Component effects must settle');
      renderPass();
      for (const effect of effects) effect();
    }
    return tree;
  }
  const input = () => nodes(render()).find(node => node.type === 'input');
  const h = {
    render, input, requests, changes, selected, focusOptions, listElement,
    options: () => nodes(render()).filter(node => node.props.role === 'option'),
    status: () => textOf(nodes(render()).find(node => node.props.role === 'status')),
    focus() { input().props.onFocus(); render(); },
    search(value) { input().props.onChange({ target: { value } }); render(); },
    update(next) { Object.assign(props, next); dirty = true; render(); },
    updateBeforeEffects(next) { Object.assign(props, next); renderPass(); deferredEffects.push(...effects); return tree; },
    keyBeforeEffects(key) {
      const event = { key, nativeEvent: { isComposing: false }, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
      nodes(tree).find(node => node.type === 'input').props.onKeyDown(event); return event;
    },
    blur(stillInside = false) { render().props.onBlur({ currentTarget: { contains: () => stillInside }, relatedTarget: null }); render(); },
    key(key, composing = false, event = {}) {
      const e = { key, nativeEvent: { isComposing: composing }, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...event };
      input().props.onKeyDown(e); render(); return e;
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
      render();
    },
    async flush() { for (let i = 0; i < 10; i++) { await Promise.resolve(); render(); } },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
    get focused() { return focused; },
    get blurred() { return blurred; },
  };
  render();
  return h;
}

test('location search debounces typing and exposes linked combobox results after loading', async t => {
  const h = harness({ id: 'profile-location' }); t.after(() => h.dispose());
  assert.equal(h.input().props['aria-expanded'], false);
  h.search('L'); h.advance(90); h.search('Lo'); h.advance(179);
  assert.equal(h.requests.length, 0, 'The superseded query must not start');
  assert.match(h.status(), /Finding locations/);
  h.advance(1);
  assert.deepEqual(h.requests.map(request => request.query), ['Lo']);
  h.requests[0].resolve([london]); await h.flush();
  const input = h.input(), option = h.options()[0];
  assert.equal(input.props.role, 'combobox');
  assert.equal(input.props['aria-expanded'], true);
  assert.equal(input.props['aria-activedescendant'], option.props.id);
  assert.equal(nodes(h.render()).find(node => node.props.role === 'listbox').props.id, input.props['aria-controls']);
  assert.equal(nodes(h.render()).find(node => node.type === 'label').props.htmlFor, input.props.id);
  assert.match(textOf(option), /LondonEngland · United Kingdom/);
});

test('superseded successful and failed requests cannot replace newer search results', async t => {
  for (const staleFails of [false, true]) {
    const h = harness(); t.after(() => h.dispose());
    h.search('London'); h.advance(180);
    h.search('Paris'); h.advance(180);
    h.requests[1].resolve([paris]); await h.flush();
    if (staleFails) h.requests[0].reject(new Error('old request failed'));
    else h.requests[0].resolve([london]);
    await h.flush();
    assert.equal(h.options().length, 1);
    assert.match(textOf(h.options()[0]), /^Paris/);
    assert.doesNotMatch(h.status(), /could not load|Finding locations/);
    assert.equal(h.input().props.value, 'Paris');
  }
});

test('arrow keys and Enter select only enabled results and ignore composition Enter', async t => {
  const h = harness({ canSelect: place => place.id !== paris.id }); t.after(() => h.dispose());
  h.search('places'); h.advance(180); h.requests[0].resolve([london, paris]); await h.flush();
  assert.equal(h.options()[0].props['aria-selected'], true);
  assert.equal(h.key('ArrowDown').defaultPrevented, true);
  assert.equal(h.options()[1].props['aria-selected'], true);
  assert.equal(h.options()[1].props['aria-disabled'], true);
  h.key('Enter'); h.options()[1].props.onClick();
  assert.equal(h.selected.length, 0, 'Disabled options cannot be chosen by keyboard or pointer');
  h.key('ArrowUp'); h.key('ArrowUp');
  assert.equal(h.options()[0].props['aria-selected'], true, 'ArrowUp stays within the first option');
  assert.equal(h.key('Enter', true).defaultPrevented, false);
  assert.equal(h.selected.length, 0);
  assert.equal(h.key('Enter').defaultPrevented, true);
  assert.deepEqual(h.selected, [london]);
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.options().length, 0);
});

test('custom profile text survives empty results, blur, Escape, and loading failure', async t => {
  const custom = 'My small hometown';
  const h = harness({ maxLength: 48, error: 'Please shorten this location' }); t.after(() => h.dispose());
  h.search(custom); h.advance(180); h.requests[0].resolve([]); await h.flush();
  assert.match(h.status(), /No matching locations/);
  h.key('Enter');
  assert.equal(h.selected.length, 0);
  h.blur();
  assert.equal(h.input().props.value, custom);
  assert.equal(h.input().props.maxLength, 48);
  const error = nodes(h.render()).find(node => node.props.role === 'alert');
  assert.equal(h.input().props['aria-describedby'], error.props.id);
  assert.equal(h.input().props['aria-invalid'], true);
  h.focus(); h.advance(180); h.requests[1].reject(new Error('offline')); await h.flush();
  assert.match(h.status(), /could not load/);
  h.key('Escape');
  assert.equal(h.input().props.value, custom);
  assert.deepEqual(h.changes, [custom], 'Search feedback must not rewrite manually entered text');
  assert.equal(h.selected.length, 0);
});

test('retry focuses the input and reissues the same query without altering manual text', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.search('Paris'); h.advance(180); h.requests[0].reject(new Error('offline')); await h.flush();
  const retry = nodes(h.render()).find(node => node.type === 'button' && textOf(node) === 'Try again');
  assert.ok(retry);
  retry.props.onClick(); h.render();
  assert.equal(h.focused, 1);
  assert.match(h.status(), /Finding locations/);
  h.advance(180);
  assert.deepEqual(h.requests.map(request => request.query), ['Paris', 'Paris']);
  h.requests[1].resolve([paris]); await h.flush();
  assert.equal(h.options().length, 1);
  assert.equal(h.input().props.value, 'Paris');
  assert.equal(h.selected.length, 0);
});

test('disabling or closing search invalidates pending responses and prevents background queries', async t => {
  const h = harness({ value: 'Paris', disabled: true }); t.after(() => h.dispose());
  h.focus(); h.advance(1000);
  assert.equal(h.requests.length, 0);
  assert.equal(h.input().props['aria-expanded'], false);
  h.update({ disabled: false }); h.advance(180);
  h.update({ disabled: true }); h.requests[0].resolve([paris]); await h.flush();
  assert.equal(h.options().length, 0);
  h.update({ disabled: false }); h.advance(180);
  h.key('Escape'); h.requests[1].reject(new Error('late failure')); await h.flush();
  assert.equal(h.input().props['aria-expanded'], false);
  h.focus(); h.advance(180);
  assert.match(h.status(), /Finding locations/);
  h.requests[2].resolve([london]); await h.flush();
  assert.match(textOf(h.options()[0]), /^London/);
});

test('first Escape closes expanded location results before the parent modal can dismiss', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.search('London'); h.advance(180); h.requests[0].resolve([london]); await h.flush();
  const listeners = new Map();
  const document = { activeElement: null,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  class Element {
    constructor(parent = null, getProps = () => ({})) { this.parent = parent; this.getProps = getProps; this.children = []; this.isConnected = true; this.tabIndex = 0; parent?.children.push(this); }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    closest(selector) {
      const props = this.getProps();
      if (selector === '[role="combobox"][aria-expanded="true"]' && props.role === 'combobox' && props['aria-expanded'] === true) return this;
      if (selector === '[role="dialog"][aria-modal="true"]' && props.role === 'dialog') return this;
      return this.parent?.closest(selector) ?? null;
    }
    matches() { return false; }
    getClientRects() { return [{}]; }
    querySelectorAll() { return this.children; }
    focus() { document.activeElement = this; }
  }
  const { containModalFocus } = sourceModule('src/hooks/useModalFocus.ts', { react: {} }, {
    document, HTMLElement: Element, getComputedStyle: () => ({ visibility: 'visible' }),
  });
  const dialog = new Element(null, () => ({ role: 'dialog' }));
  const input = new Element(dialog, () => h.input().props); input.focus();
  let dismissals = 0;
  const release = containModalFocus(dialog, () => dismissals++); t.after(release);
  const escape = () => {
    const event = { key: 'Escape', target: input, nativeEvent: { isComposing: false }, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    listeners.get('keydown')(event); // The modal listener runs during document capture.
    if (!event.stopped) h.key('Escape', false, event);
    return event;
  };
  escape();
  assert.equal(dismissals, 0);
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.input().props.value, 'London');
  assert.equal(escape().defaultPrevented, true);
  assert.equal(dismissals, 1, 'The next Escape must still reach the parent dismissal policy');
});

test('choosing a place waits for Enter when confirmation is separate', async t => {
 const confirmed=[];
 const h=harness({onConfirm:place=>confirmed.push(place)});t.after(()=>h.dispose());
 h.search('London');h.advance(180);h.requests[0].resolve([london]);await h.flush();
 assert.equal(h.input().props.enterKeyHint,undefined);
 assert.equal(h.options()[0].props.onMouseDown,undefined,'Existing shared/profile defaults do not add the mobile focus behavior');
 h.options()[0].props.onClick();h.render();
 assert.deepEqual(h.selected,[london]);assert.equal(confirmed.length,0);
 assert.equal(h.focused,0);assert.equal(h.blurred,0);
 h.key('Enter');assert.deepEqual(confirmed,[london]);
 h.search('Paris');h.key('Enter');assert.equal(confirmed.length,1,'Changing the query clears the selected place');
});

test('immediate city search opens the exact pointer or keyboard choice once and dismisses the keyboard', async t => {
 const ontario={...london,id:'city-6058560',regionName:'Ontario',countryName:'Canada'};
 for(const method of ['pointer','keyboard']){
  const h=harness({blurOnSelect:true});t.after(()=>h.dispose());
  h.search('London');h.advance(180);h.requests[0].resolve([london,ontario]);await h.flush();
  if(method==='pointer')h.options()[1].props.onClick();
  else{h.key('ArrowDown');assert.equal(h.key('Enter',true).defaultPrevented,false);assert.equal(h.selected.length,0);h.key('Enter');}
  h.render();
  assert.deepEqual(h.selected,[ontario],`${method} must immediately select the chosen duplicate, without a second confirmation`);
  assert.equal(h.focused,0,'Direct navigation must not refocus the keyboard before dismissing it');
  assert.equal(h.blurred,1);
  assert.equal(h.input().props['aria-expanded'],false);assert.equal(h.options().length,0);
  assert.equal(h.key('Enter').defaultPrevented,false,'A closed immediate search has no selected-place confirmation step');
  assert.deepEqual(h.selected,[ontario]);
 }
});

test('immediate city choice invalidates older results and cannot be replaced or reopened by a late query', async t => {
 const h=harness({blurOnSelect:true});t.after(()=>h.dispose());
 h.search('Old London');h.advance(180);
 h.search('Paris');h.advance(180);h.requests[1].resolve([paris]);await h.flush();
 h.options()[0].props.onClick();h.update({value:'Paris, Île-de-France, FR'});
 h.requests[0].resolve([london]);await h.flush();
 assert.deepEqual(h.selected,[paris]);assert.equal(h.blurred,1);assert.equal(h.focused,0);
 assert.equal(h.input().props.value,'Paris, Île-de-France, FR');
 assert.equal(h.input().props['aria-expanded'],false);assert.equal(h.options().length,0);
});

test('mobile city tap retains input focus, closes suggestions after focus events and confirms the exact chosen duplicate on Enter',async t=>{
 const confirmed=[],ontario={...london,id:'city-6058560',regionName:'Ontario',countryName:'Canada'};
 const h=harness({keepFocusOnSelect:true,blurOnSelect:true,onConfirm:place=>confirmed.push(place)});t.after(()=>h.dispose());
 h.search('London');h.advance(180);h.requests[0].resolve([london,ontario]);await h.flush();
 assert.equal(h.input().props.enterKeyHint,'search');
 const chosen=h.options()[1];let prevented=0;
 chosen.props.onPointerDown({preventDefault(){prevented++;}});
 chosen.props.onMouseDown({preventDefault(){prevented++;}});
 assert.equal(prevented,2);
 chosen.props.onClick();h.update({value:'London, Ontario, CA'});
 assert.deepEqual(h.selected,[ontario]);assert.deepEqual(confirmed,[]);
 assert.equal(h.focused,1);assert.equal(h.focusOptions[0]?.preventScroll,true);assert.equal(h.blurred,0);
 assert.equal(h.input().props['aria-expanded'],false,'Synchronous onFocus must not reopen the popup after a tap');
 assert.equal(h.options().length,0);
 h.focus();
 assert.equal(h.options().length,0,'Refocusing cannot revive the previous first London result');
 h.key('Enter',true);assert.deepEqual(confirmed,[]);
 assert.equal(h.key('Enter').defaultPrevented,true);
 assert.deepEqual(confirmed,[ontario]);assert.equal(h.blurred,1);
});

test('editing after selection clears confirmation and late requests cannot replace or reopen the chosen city',async t=>{
 const confirmed=[];
 const h=harness({keepFocusOnSelect:true,onConfirm:place=>confirmed.push(place)});t.after(()=>h.dispose());
 h.search('Old London');h.advance(180);
 h.search('Paris');h.advance(180);h.requests[1].resolve([paris]);await h.flush();
 h.options()[0].props.onClick();h.update({value:'Paris, Île-de-France, FR'});
 h.requests[0].resolve([london]);await h.flush();
 assert.equal(h.input().props['aria-expanded'],false);assert.equal(h.options().length,0);
 h.key('Enter');assert.deepEqual(confirmed,[paris]);
 h.search('London');
 assert.equal(h.key('Enter').defaultPrevented,false,'Edited input cannot confirm the previous city while a new search is pending');
 assert.deepEqual(confirmed,[paris]);
 h.advance(180);h.requests[2].resolve([london]);await h.flush();h.key('Enter');
 assert.deepEqual(confirmed,[paris,london]);
});

test('Enter and ARIA never expose results from a previous controlled query before passive effects clear them',async t=>{
 const h=harness();t.after(()=>h.dispose());h.search('London');h.advance(180);h.requests[0].resolve([london]);await h.flush();
 const snapshot=h.updateBeforeEffects({value:'Paris'});
 const input=nodes(snapshot).find(node=>node.type==='input');
 assert.equal(input.props['aria-activedescendant'],undefined);
 assert.equal(nodes(snapshot).some(node=>node.props.role==='option'),false);
 assert.equal(h.keyBeforeEffects('Enter').defaultPrevented,false);
 assert.deepEqual(h.selected,[]);h.render();
});

test('globe city menu limits matches to five cities and updates recommendations with the query',async t=>{
 const h=harness({hideLabel:true,citiesOnly:true,resultLimit:5,recommendedCities:['London','Paris']});t.after(()=>h.dispose());
 assert.equal(nodes(h.render()).find(n=>n.type==='label').props.className,'sr-only');
 h.focus();h.advance(180);assert.deepEqual(h.requests.map(r=>r.query),['London','Paris']);
 h.requests[0].resolve([london]);h.requests[1].resolve([paris]);await h.flush();assert.equal(h.options().length,2);
 h.search('Lo');h.advance(180);assert.equal(h.options().length,0,'Old recommendations clear while the new query loads');
 h.requests[2].resolve([{...london,id:'region',kind:'region'},...Array.from({length:7},(_,i)=>({...london,id:'city-'+i,name:'London '+i}))]);await h.flush();
 assert.equal(h.options().length,5);h.key('ArrowUp');h.key('Enter');assert.equal(h.selected[0].id,'city-0');
});

const optionPointerEvent = (overrides = {}) => ({
  pointerType: 'touch', pointerId: 41, isPrimary: true, button: 0, clientX: 60, clientY: 120,
  defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...overrides,
});

test('a completed touch or pen tap fills the controlled city label without a synthetic click and selects the exact duplicate once', async t => {
  const ontario = { ...london, id: 'city-6058560', regionName: 'Ontario', countryName: 'Canada' };
  for (const pointerType of ['touch', 'pen']) {
    const h = harness({ blurOnSelect: true, onSelect(place) {
      h.selected.push(place);
      h.update({ value: `${place.name}, ${place.regionName}, ${place.countryName}` });
    } }); t.after(() => h.dispose());
    h.search('London'); h.advance(180); h.requests[0].resolve([london, ontario]); await h.flush();
    const chosen = h.options()[1];
    chosen.props.onPointerDown(optionPointerEvent({ pointerType }));
    assert.equal(h.selected.length, 0, 'Touch-down alone must leave the list available for panning');
    chosen.props.onPointerUp(optionPointerEvent({ pointerType, clientX: 63, clientY: 123 })); h.render();
    assert.deepEqual(h.selected, [ontario], 'Pointer-up must commit without waiting for an emulated mouse click');
    assert.equal(h.input().props.value, 'London, Ontario, Canada');
    assert.equal(h.input().props['aria-expanded'], false);
    assert.equal(h.options().length, 0);
    assert.equal(h.blurred, 1);
    chosen.props.onClick({ detail: 1 }); h.render();
    assert.deepEqual(h.selected, [ontario], 'A later compatibility click must not repeat navigation or selection');
    assert.equal(h.blurred, 1);
  }
});

test('pans, cancellations, changed scroll and invalid pointers cannot turn into a city selection', async t => {
  for (const gesture of ['moved', 'moved-back', 'up-moved', 'cancelled', 'scrolled', 'mismatched-id', 'nonprimary', 'secondary-button', 'different-option']) {
    const h = harness({ blurOnSelect: true }); t.after(() => h.dispose());
    h.search('cities'); h.advance(180); h.requests[0].resolve([london, paris]); await h.flush();
    const chosen = h.options()[0];
    chosen.props.onPointerDown(optionPointerEvent(gesture === 'nonprimary' ? { isPrimary: false } : gesture === 'secondary-button' ? { button: 2 } : {}));
    if (gesture === 'moved' || gesture === 'moved-back') {
      const move = optionPointerEvent({ clientY: 145 }); chosen.props.onPointerMove(move);
      assert.equal(move.defaultPrevented, false, 'A pan must retain native scrolling');
      if (gesture === 'moved-back') chosen.props.onPointerMove(optionPointerEvent());
    }
    if (gesture === 'cancelled') chosen.props.onPointerCancel(optionPointerEvent());
    if (gesture === 'scrolled') h.listElement.scrollTop = 30;
    const released = gesture === 'different-option' ? h.options()[1] : chosen;
    released.props.onPointerUp(optionPointerEvent(gesture === 'mismatched-id' ? { pointerId: 42 } : gesture === 'up-moved' ? { clientX: 80 } : {}));
    released.props.onClick({ detail: 1 }); h.render();
    assert.equal(h.selected.length, 0, `${gesture} must not select a city, even if the browser follows it with click`);
    assert.equal(h.input().props.value, 'cities');
    assert.equal(h.blurred, 0);
    assert.equal(h.input().props['aria-expanded'], true);
  }
});

test('a query change during touch invalidates the old option and late responses cannot reopen a completed tap', async t => {
  const h = harness({ blurOnSelect: true }); t.after(() => h.dispose());
  h.search('Old London'); h.advance(180);
  h.search('London'); h.advance(180); h.requests[1].resolve([london]); await h.flush();
  const stale = h.options()[0];
  stale.props.onPointerDown(optionPointerEvent());
  h.search('Paris'); h.advance(180); h.requests[2].resolve([paris]); await h.flush();
  stale.props.onPointerUp(optionPointerEvent()); stale.props.onClick({ detail: 1 }); h.render();
  assert.deepEqual(h.selected, []);
  assert.equal(h.input().props.value, 'Paris');
  assert.match(textOf(h.options()[0]), /^Paris/);
  const chosen = h.options()[0];
  chosen.props.onPointerDown(optionPointerEvent()); chosen.props.onPointerUp(optionPointerEvent()); h.update({ value: 'Paris, Île-de-France, France' });
  h.requests[0].resolve([london]); await h.flush();
  assert.deepEqual(h.selected, [paris]);
  assert.equal(h.input().props.value, 'Paris, Île-de-France, France');
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.options().length, 0);
});

test('touch hover does not move the active option while mouse hover, mouse click and keyboard selection remain available', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.search('cities'); h.advance(180); h.requests[0].resolve([london, paris]); await h.flush();
  h.options()[1].props.onPointerEnter(optionPointerEvent()); h.render();
  assert.equal(h.options()[0].props['aria-selected'], true, 'Entering with a finger must not activate and auto-scroll a different row');
  h.options()[1].props.onPointerEnter(optionPointerEvent({ pointerType: 'mouse' })); h.render();
  assert.equal(h.options()[1].props['aria-selected'], true);
  const mouse = h.options()[1];
  mouse.props.onPointerDown(optionPointerEvent({ pointerType: 'mouse' }));
  mouse.props.onPointerUp(optionPointerEvent({ pointerType: 'mouse' }));
  assert.equal(h.selected.length, 0, 'Mouse selection still waits for its ordinary click');
  mouse.props.onClick({ detail: 1 }); h.render();
  assert.deepEqual(h.selected, [paris]);
  h.search('London'); h.advance(180); h.requests[1].resolve([london]); await h.flush(); h.key('Enter');
  assert.deepEqual(h.selected, [paris, london]);
});

test('touch selection respects profile validation and its separate confirmation contract', async t => {
  const confirmed = [];
  const h = harness({ keepFocusOnSelect: true, blurOnSelect: true, canSelect: place => place.id !== paris.id, onConfirm: place => confirmed.push(place) }); t.after(() => h.dispose());
  h.search('cities'); h.advance(180); h.requests[0].resolve([london, paris]); await h.flush();
  let chosen = h.options()[1];
  chosen.props.onPointerDown(optionPointerEvent()); chosen.props.onPointerUp(optionPointerEvent()); h.render();
  assert.deepEqual(h.selected, []); assert.deepEqual(confirmed, []); assert.equal(h.blurred, 0);
  chosen = h.options()[0];
  chosen.props.onPointerDown(optionPointerEvent()); chosen.props.onPointerUp(optionPointerEvent()); h.render();
  assert.deepEqual(h.selected, [london]); assert.deepEqual(confirmed, []);
  assert.equal(h.focused, 1); assert.equal(h.blurred, 0);
  h.key('Enter');
  assert.deepEqual(confirmed, [london]); assert.equal(h.blurred, 1);
});


test('profile setup touch and keyboard choices fill the actual controlled label and immediately leave the focused chooser', async t => {
  const city = { id: 'gn-5391959', kind: 'city', name: 'San Francisco', regionName: 'California', countryCode: 'US', countryName: 'United States', countryIso3: 'USA', uniqueInCountry: true };
  for (const method of ['touch', 'keyboard']) {
    const h = harness({ id: 'onboarding-location', focusedScreen: true }, { profilePicker: true });
    t.after(() => h.dispose());
    h.search('old city'); h.advance(180);
    h.search('san fr'); h.advance(180); h.requests[1].resolve([city]); await h.flush();
    const chosen = h.options()[0];
    if (method === 'touch') {
      chosen.props.onPointerDown(optionPointerEvent());
      chosen.props.onPointerUp(optionPointerEvent());
    } else {
      assert.equal(h.key('Enter').defaultPrevented, true);
    }
    h.render();
    assert.equal(h.input().props.value, 'San Francisco, California, US', method + ' must fill the real profile label immediately');
    assert.equal(h.changes.filter(value => value === 'San Francisco, California, US').length, 1);
    assert.equal(h.blurred, 1, method + ' must leave the focus-only full-screen chooser without another Enter');
    assert.equal(h.focused, 0);
    assert.equal(h.input().props['aria-expanded'], false);
    assert.equal(h.options().length, 0);
    if (method === 'touch') chosen.props.onClick({ detail: 1 });
    if (method === 'touch') h.requests[0].resolve([london]);
    else h.requests[0].reject(new Error('stale search failed'));
    await h.flush();
    assert.equal(h.input().props.value, 'San Francisco, California, US');
    assert.equal(h.changes.filter(value => value === 'San Francisco, California, US').length, 1);
    assert.equal(h.blurred, 1);
    assert.equal(h.input().props['aria-expanded'], false);
    assert.equal(h.options().length, 0);
    assert.equal(h.key('Enter').defaultPrevented, false, 'The completed choice must not retain a confirmation step');
  }
});

test('web profile selection fills the actual controlled label without forcing blur', async t => {
  const city = { ...paris, countryCode: 'FR', countryIso3: 'FRA', uniqueInCountry: true };
  const h = harness({ id: 'profile-editor-city', focusedScreen: false }, { profilePicker: true });
  t.after(() => h.dispose());
  h.search('par'); h.advance(180); h.requests[0].resolve([city]); await h.flush();
  h.options()[0].props.onClick({ detail: 1 }); h.render();
  assert.equal(h.input().props.value, 'Paris, Île-de-France, FR');
  assert.equal(h.changes.filter(value => value === 'Paris, Île-de-France, FR').length, 1);
  assert.equal(h.blurred, 0);
  assert.equal(h.input().props['aria-expanded'], false);
  assert.equal(h.options().length, 0);
  assert.equal(h.key('Enter').defaultPrevented, false);
});
