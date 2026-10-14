import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const calendar = sourceModule('src/features/journey/calendar.ts');
const journey = sourceModule('src/features/journey/journey.ts');
const timeline = sourceModule('src/features/citations/journeyCitations.ts', { '../journey/journey': journey });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const project = (id, date, patch = {}) => ({ id, categoryId: 'portal', title: id, summary: 'A real project', cover: '', madeOn: date, ...patch });
const entry = (id, date) => ({ kind: 'project', date, project: project(id, date) });
const profile = { id: 'creator', name: 'Creator', categories: [{ id: 'portal', label: 'Work' }], projects: [] };
const sparse = [entry('old', '1990-01-01'), entry('leap', '2024-02-29'), entry('new', '2026-10-13')];

/** Execute the actual component with committed refs, effects, state and scroll events. */
function componentHarness(file, name, initial, overrides = {}) {
  const slots = [], frames = new Map(), listeners = new Map(), scrolls = [], targets = new Map(), properties = new Map();
  let cursor = 0, dirty = true, tree, props = initial, effects = [], lastRefs = [], frameId = 0, wrapperKey;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    lazy: () => 'month-calendar',
    useState(initialValue) { const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }]; },
    useRef(initialValue) { const index = cursor++; slots[index] ??= { current: initialValue }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useEffect(callback, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const identity = { getBoundingClientRect: () => ({ height: 140 }) };
  const scope = { querySelector: () => identity };
  const header = { getBoundingClientRect: () => ({ bottom: 288, height: 148 }), contains: target => target === header || Boolean(target?.fromJourneyHeader) };
  const root = { style: { setProperty: (name, value) => properties.set(name, value) }, closest: selector => selector === '[aria-hidden="true"]' ? null : scope,
    querySelector(selector) { const match = selector.match(/data-journey-date="([^"]+)"/); if (!match) return null; const first = nodes(tree).find(node => node.props['data-journey-date'] === match[1]); const element = targets.get(match[1]); if (element) element.rowKey = first?.key; return element; } };
  const imports = {
    react, 'lucide-react': new Proxy({}, { get: (_target, key) => key }),
    './calendar': calendar, './journey': journey, './JourneyView': { JourneyCover: 'cover' },
    './JourneyCalendar': { JourneyCalendar: 'journey-calendar' },
    '../../components/text/FormattedText': { FormattedText: 'formatted-text' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/DeferredDialog': { DeferredDialog: 'dialog' },
    '../../components/media/MobileProjectPopup': { MobileProjectPopup: 'project-popup' },
    '../../components/media/ProjectCover': { ProjectCover: 'project-cover' },
    '../../presentation/usePresentation': { usePresentation: () => props.presentation ?? 'mobile' },
    '../citations/useJourneyCitations': { useJourneyCitations: () => props.events ?? [] },
    '../citations/journeyCitations': timeline,
    './journey-calendar.css': {}, './journey.css': {}, ...overrides,
  };
  const Component = sourceModule(file, imports, {
    Date, getComputedStyle: () => ({ position: 'sticky' }),
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
    document: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) },
  })[name];
  function target(day) {
    let element = targets.get(day);
    if (!element) { element = { top: 500, style: {}, getBoundingClientRect() { return { top: this.top }; }, scrollIntoView(options) { scrolls.push({ day, options, rowKey: this.rowKey }); } }; targets.set(day, element); }
    return element;
  }
  function commit() {
    lastRefs.forEach(ref => ref(null)); lastRefs = [];
    for (const node of nodes(tree)) {
      const dated = node.props.className === 'journey-calendar-day' ? nodes(node).find(child => child.type === 'time')?.props.dateTime : node.props['data-journey-date'];
      if (dated) target(dated);
      if (!node.ref) continue;
      const element = dated ? target(dated) : node.props.className === 'journey-calendar-header' ? header : root;
      if (typeof node.ref === 'function') { node.ref(element); lastRefs.push(node.ref); }
      else node.ref.current = element;
    }
  }
  function render() {
    let count = 0;
    while (dirty) {
      assert.ok(++count < 30, 'component settles without a selection loop'); cursor = 0; dirty = false; effects = [];
      const output = Component(props);
      if (typeof output?.type === 'function' && output.type.name === 'JourneyContent') {
        if (wrapperKey !== output.key) { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; lastRefs.forEach(ref => ref(null)); lastRefs = []; targets.clear(); wrapperKey = output.key; }
        tree = output.type(output.props);
      } else tree = output;
      commit(); effects.forEach(effect => effect());
    }
    return tree;
  }
  return {
    get tree() { return render(); }, get nodes() { return nodes(render()); }, get wrapperKey() { render(); return wrapperKey; }, scrolls, properties,
    target(day) { render(); return targets.get(day); },
    selected() { return this.nodes.find(node => node.type === 'input')?.props.value; },
    button(label) { return this.nodes.find(node => node.type === 'button' && node.props['aria-label'] === label); },
    update(next) { props = { ...props, ...next }; dirty = true; return render(); },
    intent(type, extra = {}) { render(); listeners.get(type)?.({ type, target: { fromJourneyHeader: false }, ...extra }); },
    frames() { render(); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); return render(); },
    scroll(day) { render(); for (const [date, element] of targets) element.top = date <= day ? 100 : 900; listeners.get('scroll')?.(); this.frames(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); lastRefs.forEach(ref => ref(null)); },
  };
}
const calendarHarness = (entries = sparse, extra = {}) => componentHarness('src/features/journey/JourneyCalendar.tsx', 'JourneyCalendar', { profile, owner: true, entries, onOpen() {}, onDetails() {}, ...extra });

test('actual agenda renders posted dates only, retains all same-day and undated entries, and measures sticky header clearance', () => {
  const dated = [...sparse, entry('same-day', '2026-10-13'), entry('undated', 'invalid')];
  const h = calendarHarness(dated);
  assert.equal(h.selected(), '2026-10-13');
  assert.deepEqual(h.nodes.filter(node => node.type === 'time').map(node => node.props.dateTime), ['1990-01-01', '2024-02-29', '2026-10-13']);
  assert.equal(h.nodes.filter(node => node.type === 'li').length, 5);
  assert.ok(h.nodes.some(node => node.type === 'h2' && node.props.children === 'Date not set'));
  assert.equal(h.properties.get('--journey-calendar-top'), '140px');
  assert.equal(h.properties.get('--journey-calendar-height'), '148px');
  assert.equal(h.scrolls[0].day, '2026-10-13');
  h.dispose();
});

test('previous and next arrows jump directly across decades of sparse posted dates and stop at real bounds', () => {
  const h = calendarHarness(); h.tree; h.scrolls.length = 0;
  assert.equal(h.button('Next date with work').props.disabled, true);
  h.button('Previous date with work').props.onClick(); assert.equal(h.selected(), '2024-02-29');
  h.button('Previous date with work').props.onClick(); assert.equal(h.selected(), '1990-01-01');
  assert.equal(h.button('Previous date with work').props.disabled, true);
  h.button('Next date with work').props.onClick(); assert.equal(h.selected(), '2024-02-29');
  h.button('Next date with work').props.onClick(); assert.equal(h.selected(), '2026-10-13');
  assert.deepEqual(h.scrolls.map(item => item.day), ['2024-02-29', '1990-01-01', '2024-02-29', '2026-10-13']);
  assert.ok(h.scrolls.every(item => item.options.block === 'start'));
  h.dispose();
});

test('native date and week selections skip an empty day forward, clamp after the last post, and never create an empty row', () => {
  const h = calendarHarness();
  const pick = day => { h.nodes.find(node => node.type === 'input').props.onChange({ target: { value: day } }); return h.selected(); };
  assert.equal(pick('2020-01-01'), '2024-02-29');
  assert.equal(pick('1980-01-01'), '1990-01-01');
  assert.equal(pick('2030-01-01'), '2026-10-13');
  const week = h.nodes.find(node => node.props.className === 'journey-calendar-week');
  const monday = nodes(week).filter(node => node.type === 'button')[1];
  monday.props.onClick(); assert.equal(h.selected(), '2026-10-13');
  assert.equal(pick('invalid'), '2026-10-13');
  assert.equal(h.nodes.filter(node => node.type === 'time').length, 3);
  h.dispose();
});

test('a month jump is consumed once and scroll tracking remains free; repeated picks of the same date still scroll', () => {
  const h = calendarHarness(); h.tree; h.scrolls.length = 0;
  h.update({ jumpTo: { day: '1990-01-01', request: 1 } });
  assert.equal(h.selected(), '1990-01-01'); assert.equal(h.scrolls.length, 1);
  h.intent('wheel');
  h.scroll('2024-02-29'); assert.equal(h.selected(), '2024-02-29');
  h.update({ entries: [...sparse], jumpTo: { day: '1990-01-01', request: 1 } });
  assert.equal(h.selected(), '2024-02-29'); assert.equal(h.scrolls.length, 1);
  h.update({ jumpTo: { day: '1990-01-01', request: 2 } });
  assert.equal(h.selected(), '1990-01-01'); assert.equal(h.scrolls.length, 2);
  h.update({ jumpTo: { day: '1990-01-01', request: 3 } });
  assert.equal(h.selected(), '1990-01-01'); assert.equal(h.scrolls.length, 3);
  h.dispose();
});

test('toolbar focus scrolling cannot change the date before its click; real scrolling intent resumes tracking', () => {
  const h = calendarHarness(); h.tree; h.scrolls.length = 0;
  // Browsers can scroll a sticky Previous control into view before activating it.
  h.scroll('2024-02-29');
  assert.equal(h.selected(), '2026-10-13');
  h.intent('pointerdown', { target: { fromJourneyHeader: true } });
  h.scroll('2024-02-29');
  assert.equal(h.selected(), '2026-10-13');
  h.button('Previous date with work').props.onClick();
  assert.equal(h.selected(), '2024-02-29', 'Previous advances once from the selected date, rather than skipping to 1990.');
  h.intent('wheel'); h.scroll('1990-01-01');
  assert.equal(h.selected(), '1990-01-01');
  h.update({ jumpTo: { day: '2026-10-13', request: 1 } });
  h.intent('keydown', { key: 'ArrowDown', target: { fromJourneyHeader: true } });
  h.scroll('2024-02-29'); assert.equal(h.selected(), '2026-10-13');
  h.intent('keydown', { key: 'a' });
  h.scroll('2024-02-29'); assert.equal(h.selected(), '2026-10-13');
  h.intent('keydown', { key: 'PageDown' });
  h.scroll('2024-02-29'); assert.equal(h.selected(), '2024-02-29');
  h.update({ jumpTo: { day: '2026-10-13', request: 2 } });
  h.intent('touchmove'); h.scroll('1990-01-01'); assert.equal(h.selected(), '1990-01-01');
  h.update({ jumpTo: { day: '2026-10-13', request: 3 } });
  h.intent('pointerdown'); h.scroll('2024-02-29'); assert.equal(h.selected(), '2024-02-29');
  h.dispose();
});

test('an undated-only Journey keeps the work and owner Add without date navigation or empty-day placeholders', () => {
  let adds = 0;
  const h = calendarHarness([entry('undated', 'invalid')], { onAdd: () => adds++ });
  assert.equal(h.selected(), undefined);
  assert.equal(h.nodes.filter(node => node.type === 'li').length, 1);
  assert.equal(h.nodes.some(node => node.props.className === 'journey-calendar-header'), false);
  h.nodes.find(node => node.props.className === 'journey-calendar-add').props.onClick(); assert.equal(adds, 1);
  h.update({ owner: false });
  assert.equal(h.nodes.some(node => node.props.className === 'journey-calendar-add'), false);
  h.dispose();
});

test('the mobile parent scopes consumed month requests to the viewed profile and owner mode', () => {
  const initial = { profile: { ...profile, projects: sparse.map(item => item.project) }, owner: true, onOpen() {}, presentation: 'mobile' };
  const h = componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', initial);
  const child = () => h.nodes.find(node => node.type === 'journey-calendar');
  assert.equal(child().key, 'creator:true');
  assert.equal(h.wrapperKey, 'creator:true');
  h.button('Open Journey calendar for today').props.onClick();
  h.nodes.find(node => node.type === 'month-calendar').props.onSelect('1990-01-01');
  assert.equal(child().props.jumpTo.request, 1);
  h.update({ profile: { ...initial.profile, id: 'other' } });
  assert.equal(child().key, 'other:true'); assert.equal(child().props.jumpTo, undefined);
  assert.equal(h.wrapperKey, 'other:true');
  h.button('Open Journey calendar for today').props.onClick();
  h.nodes.find(node => node.type === 'month-calendar').props.onSelect('2024-02-29');
  assert.equal(child().props.jumpTo.request, 1);
  h.update({ owner: false });
  assert.equal(child().key, 'other:false'); assert.equal(child().props.jumpTo, undefined);
  assert.equal(h.wrapperKey, 'other:false');
  assert.equal(h.nodes.some(node => node.type === 'month-calendar'), false);
  const remounted = calendarHarness(sparse, { profile: { ...profile, id: 'other' }, owner: false, jumpTo: { day: '1990-01-01', request: 1 } });
  assert.equal(remounted.selected(), '1990-01-01');
  h.dispose(); remounted.dispose();
});

test('WEB month navigation keeps the year rail and jumps to its first same-day entry with profile header clearance', () => {
  const visible = project('visible', '2026-10-13'), sameDay = project('same-day', '2026-10-13'), hidden = project('hidden', '1990-01-01', { isPubliclyVisible: false });
  const h = componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', { profile: { ...profile, projects: [visible, sameDay, hidden] }, owner: false, onOpen() {}, presentation: 'web', events: [{ id: 'citation', date: '2024-02-29', href: '/citation', label: 'Existing public citation' }] });
  assert.equal(h.nodes.some(node => node.type === 'journey-calendar'), false);
  assert.equal(h.nodes.filter(node => node.props.className === 'journey-year').length, 2);
  h.button('Open Journey calendar for today').props.onClick();
  const month = h.nodes.find(node => node.type === 'month-calendar');
  assert.deepEqual(Array.from(month.props.days, ([day]) => day), ['2024-02-29', '2026-10-13']);
  assert.equal(month.props.days.flatMap(([, entries]) => entries).some(item => item.project?.id === hidden.id), false);
  month.props.onSelect('2020-01-01'); h.frames();
  assert.equal(h.scrolls.at(-1).day, '2024-02-29');
  h.button('Open Journey calendar for today').props.onClick();
  h.nodes.find(node => node.type === 'month-calendar').props.onSelect('2026-10-13'); h.frames();
  assert.equal(h.scrolls.at(-1).day, '2026-10-13');
  // Each date uses querySelector's first existing rail entry, rather than creating a calendar row.
  assert.equal(h.nodes.filter(node => node.props['data-journey-date'] === '2026-10-13').length, 2);
  assert.equal(h.scrolls.at(-1).options.block, 'start');
  assert.equal(h.scrolls.at(-1).rowKey, 'same-day');
  assert.equal(h.target('2026-10-13').style.scrollMarginTop, '156px');
  h.dispose();
});
