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
    lazy: loader => loader.toString().includes('PortalProjectPopup') ? 'portal-project-popup' : 'month-calendar',
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
    '../../components/profile/PortalProjectPopup': { PortalProjectPopup: 'portal-project-popup' },
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
const calendarHarness = (entries = sparse, extra = {}) => componentHarness('src/features/journey/JourneyCalendar.tsx', 'JourneyCalendar', { profile, owner: true, entries, onOpen() {}, onOpenPortal() {}, onOpenCalendar() {}, onDetails() {}, ...extra });
// FormattedText is a descendant boundary in this harness; its text prop is its
// visible content, so descriptions cannot accidentally disappear from assertions.
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : React.isValidElement(tree) ? tree.type === 'formatted-text' ? tree.props.text : text(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';

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

test('calendar Today opens the month screen above date navigation without changing the selected date or scrolling', () => {
  let opened = 0;
  const h = calendarHarness(sparse, { onOpenCalendar: () => opened++ });
  h.button('Previous date with work').props.onClick();
  const selected = h.selected(), rows = h.nodes.filter(node => node.type === 'li').map(node => node.key);
  h.scrolls.length = 0;
  const header = h.nodes.find(node => node.props.className === 'journey-calendar-header');
  const controls = nodes(header).filter(node => node.type === 'button');
  assert.equal(controls[0].props['aria-label'], 'Open Timeline calendar for today');
  assert.equal(controls[1].props['aria-label'], 'Previous date with work');
  assert.equal(controls[2].props['aria-label'], 'Next date with work');
  const today = h.button('Open Timeline calendar for today');
  assert.equal(today.props.type, 'button'); assert.equal(today.props['aria-haspopup'], 'dialog');
  today.props.onClick();
  assert.equal(opened, 1); assert.equal(h.selected(), selected);
  assert.deepEqual(h.scrolls, [], 'Opening the month screen does not jump the posted-work agenda to today.');
  assert.deepEqual(h.nodes.filter(node => node.type === 'li').map(node => node.key), rows);
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

test('portal activation and popup interaction preserve the calendar date until normal Timeline scrolling resumes', () => {
  const h = calendarHarness();
  h.nodes.find(node => node.type === 'input').props.onChange({ target: { value: '2024-02-29' } });
  assert.equal(h.selected(), '2024-02-29');
  const portalTarget = { closest: selector => selector.split(',').some(value => ['.journey-calendar-portal', '.journey-portal'].includes(value.trim())) ? {} : null };
  // A portal can sit on an older row than the calendar's requested date. Its
  // pointer or Space activation must not unlock focus-induced scroll tracking.
  for (const [type, extra] of [['pointerdown', {}], ['keydown', { key: ' ' }]]) {
    h.intent(type, { target: portalTarget, ...extra });
    h.scroll('1990-01-01');
    assert.equal(h.selected(), '2024-02-29');
  }
  h.update({ openPortalId: 'portal' });
  for (const [type, extra] of [['pointerdown', {}], ['wheel', {}], ['touchmove', {}], ['keydown', { key: 'PageDown' }]]) {
    h.intent(type, extra); h.scroll('2026-10-13');
    assert.equal(h.selected(), '2024-02-29', `${type} inside an open popup cannot move its background calendar.`);
  }
  h.update({ openPortalId: null });
  h.scroll('1990-01-01');
  assert.equal(h.selected(), '2024-02-29', 'Closing the popup preserves the prior requested-date hold.');
  h.intent('wheel'); h.scroll('1990-01-01');
  assert.equal(h.selected(), '1990-01-01', 'A real wheel scroll after dismissal resumes Timeline tracking.');
  // Also cover opening after a free scroll, when there is no requested-date
  // hold: the popup itself must freeze tracking rather than rely on that hold.
  h.update({ openPortalId: 'portal' });
  h.intent('touchmove'); h.scroll('2026-10-13');
  assert.equal(h.selected(), '1990-01-01');
  h.update({ openPortalId: null });
  h.intent('touchmove'); h.scroll('2026-10-13');
  assert.equal(h.selected(), '2026-10-13', 'A real touch scroll after dismissal still follows posted work.');
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

const viewHarness = initial => componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', initial);
const timelineRows = h => h.nodes.filter(node => node.props.className === 'journey-entry');
const yearSections = h => h.nodes.filter(node => node.props.className === 'journey-year');
const sortButton = (h, label) => h.nodes.find(node => node.type === 'button' && node.props.children === label);
const timelineOrder = h => h.nodes.find(node => node.props.className === 'journey-view').props['data-timeline-order'];

for (const presentation of ['mobile', 'web']) test(`${presentation} continuous Timeline swaps both year and row order in place with truthful project counts`, () => {
  const opened = [];
  const works = [project('old', '1990-01-01'), project('leap', '2024-02-29'), project('same-year', '2024-03-01'),
    project('new', '2026-10-13'), project('undated', 'invalid'), project('private', '2027-01-01', { isPubliclyVisible: false }),
    project('preview', '2028-01-01', { sessionOnly: true })];
  for (const work of works) { work.summary = 'Never list this description.'; work.creationDetails = { answers: { learned: 'Never list this lesson.' } }; }
  const viewed = { ...profile, projects: works };
  const events = [{ id: 'cited', date: '2024-03-02', label: 'A real citation', href: '/cite/page', thumbnail: 'citation-cover.webp' },
    { id: 'citation-only', date: '2020-01-01', label: 'Earlier citation', href: '/share/other/c/portal/project' }];
  const h = viewHarness({ profile: viewed, owner: false, presentation, events, onOpen: work => opened.push(work) });
  const key = h.wrapperKey;
  const order = h.nodes.find(node => node.props.role === 'group' && node.props['aria-label'] === 'Timeline order');
  assert.ok(order);assert.equal(nodes(order).filter(node => node.type === 'button').length, 2);
  assert.equal(timelineOrder(h), 'newest');assert.equal(sortButton(h, 'Newest first').props['aria-pressed'], true);
  assert.equal(sortButton(h, 'Oldest first').props['aria-pressed'], false);
  assert.deepEqual(yearSections(h).map(node => node.props['aria-label']), ['2026', '2024', '2020', '1990', 'Date not set']);
  assert.deepEqual(yearSections(h).map(node => text(nodes(node).find(child => child.type === 'h2')).trim().replace(/\s+/g, ' ')),
    ['2026 1 project', '2024 2 projects', '2020 0 projects', '1990 1 project', 'Date not set 1 project']);
  const newestRows = timelineRows(h).map(node => node.key);
  assert.deepEqual(newestRows, ['project:new', 'citation:cited', 'project:same-year', 'project:leap', 'citation:citation-only', 'project:old', 'project:undated']);
  assert.doesNotMatch(text(h.tree), /Never list|private|preview|No work recorded|What were you making/);
  assert.equal(h.nodes.some(node => node.type === 'journey-calendar'), false);
  for (const year of yearSections(h)) assert.equal(nodes(year).some(node => node.type === 'img' || node.type === 'project-cover' || node.type?.name === 'JourneyCover'), false, 'List rows do not request project or citation thumbnails.');
  for (const row of timelineRows(h)) {
    const children = React.Children.toArray(row.props.children);
    assert.equal(children[0].props.className, 'journey-date');
    assert.equal(children[1].props.className, 'journey-entry-copy');
  }
  assert.equal(h.nodes.find(node => node.type === 'a' && node.props.children === 'A real citation').props.href, '/cite/page');
  h.nodes.find(node => node.type === 'button' && node.props.className === 'journey-title' && node.props.children === 'leap').props.onClick();
  assert.equal(opened[0], works[1], 'The title still opens the canonical project object.');opened.length = 0;
  sortButton(h, 'Oldest first').props.onClick();h.frames();
  assert.equal(timelineOrder(h), 'oldest');assert.equal(h.wrapperKey, key);
  assert.equal(sortButton(h, 'Newest first').props['aria-pressed'], false);assert.equal(sortButton(h, 'Oldest first').props['aria-pressed'], true);
  assert.deepEqual(yearSections(h).map(node => node.props['aria-label']), ['1990', '2020', '2024', '2026', 'Date not set']);
  assert.deepEqual(timelineRows(h).map(node => node.key), ['project:old', 'citation:citation-only', 'project:leap', 'project:same-year', 'citation:cited', 'project:new', 'project:undated']);
  assert.deepEqual([...timelineRows(h).map(node => node.key)].sort(), [...newestRows].sort());
  assert.deepEqual(h.scrolls, []);assert.deepEqual(opened, [], 'Sorting is an immediate local list operation, not project navigation.');
  h.update({ profile: { ...viewed, projects: [...works, project('added', '2029-01-01')] } });
  assert.equal(timelineOrder(h), 'oldest');assert.equal(timelineRows(h).length, 8);
  h.update({ owner: true });
  assert.equal(timelineOrder(h), 'newest');assert.equal(timelineRows(h).some(node => node.key === 'project:private'), true);
  assert.equal(timelineRows(h).some(node => node.key === 'project:preview'), false);h.dispose();
});

test('Timeline details preserve mobile read-only access and owner edit/delete behavior while desktop visitors have no options', () => {
  for (const presentation of ['mobile', 'web']) {
    const work = project('work', '2026-01-01'), opened = [], edited = [], descriptions = [], deleted = [], added = [];
    const h = viewHarness({ profile: { ...profile, projects: [work] }, owner: false, presentation, onOpen: value => opened.push(value.id),
      onEdit: value => edited.push(value.id), onEditDescription: value => descriptions.push(value.id), onDelete: value => deleted.push(value.id), onAdd: () => added.push(true) });
    if (presentation === 'mobile') {
      h.button('Show details for work').props.onClick();
      const popup = h.nodes.find(node => node.type === 'project-popup');assert.equal(popup.props.project, work);
      assert.equal(popup.props.contextHandlers, undefined);assert.equal(popup.props.onOptions, undefined);assert.equal(popup.props.onEditDescription, undefined);
      popup.props.onClose();assert.equal(h.nodes.some(node => node.type === 'project-popup'), false);
    } else assert.equal(h.button('Show details for work'), undefined);
    assert.equal(h.nodes.some(node => node.type === 'button' && /Add work/.test(text(node))), false);
    h.update({ owner: true });h.button('Show details for work').props.onClick();
    if (presentation === 'mobile') {
      const popup = h.nodes.find(node => node.type === 'project-popup');
      popup.props.onOptions();popup.props.onEditDescription();popup.props.contextHandlers.delete();
      assert.deepEqual(descriptions, ['work']);assert.deepEqual(deleted, ['work']);
    }
    assert.deepEqual(edited, ['work']);assert.deepEqual(opened, []);
    h.nodes.find(node => node.type === 'button' && /Add work/.test(text(node))).props.onClick();assert.deepEqual(added, [true]);h.dispose();
  }
});

test('the year-list parent scopes order, month requests and open dialogs to the viewed profile and owner mode', () => {
  for (const presentation of ['mobile', 'web']) {
    const initial = { profile: { ...profile, projects: sparse.map(item => item.project) }, owner: true, onOpen() {}, presentation };
    const h = viewHarness(initial);
    assert.equal(h.wrapperKey, 'creator:true');
    sortButton(h, 'Oldest first').props.onClick();assert.equal(timelineOrder(h), 'oldest');
    h.button('Open Timeline calendar for today').props.onClick();
    h.nodes.find(node => node.type === 'month-calendar').props.onSelect('1990-01-01');h.frames();
    assert.equal(h.scrolls.at(-1).day, '1990-01-01');h.scrolls.length = 0;
    h.button('Open Timeline calendar for today').props.onClick();
    h.update({ profile: { ...initial.profile, id: 'other' } });h.frames();
    assert.equal(h.wrapperKey, 'other:true');assert.equal(timelineOrder(h), 'newest');
    assert.equal(h.nodes.some(node => node.type === 'month-calendar'), false);assert.deepEqual(h.scrolls, []);
    sortButton(h, 'Oldest first').props.onClick();
    h.button('Open Timeline calendar for today').props.onClick();
    h.update({ owner: false });h.frames();
    assert.equal(h.wrapperKey, 'other:false');assert.equal(timelineOrder(h), 'newest');
    assert.equal(h.nodes.some(node => node.type === 'month-calendar'), false);assert.deepEqual(h.scrolls, []);
    h.dispose();
  }
});

test('empty and undated Timelines retain Today and only owners can add work, without empty-day placeholders', () => {
  for (const presentation of ['mobile', 'web']) for (const projects of [[], [project('undated', 'invalid')]]) {
    let adds = 0;
    const h = viewHarness({ profile: { ...profile, projects }, owner: true, onOpen() {}, onAdd: () => adds++, presentation });
    const controls = h.nodes.filter(node => node.type === 'button' && node.props['aria-label'] === 'Open Timeline calendar for today');
    assert.equal(controls.length, 1);assert.equal(h.nodes.some(node => node.type === 'journey-calendar'), false);
    assert.equal(timelineRows(h).length, projects.length);assert.doesNotMatch(text(h.tree), /No work recorded|What were you making/);
    controls[0].props.onClick();const month = h.nodes.find(node => node.type === 'month-calendar');
    assert.ok(month);assert.deepEqual(Array.from(month.props.days), []);month.props.onClose();
    const add = h.nodes.find(node => node.type === 'button' && /Add your first project|Add work/.test(text(node)));
    assert.ok(add);add.props.onClick();assert.equal(adds, 1);
    h.update({ owner: false });assert.equal(h.nodes.some(node => node.type === 'button' && /Add your first project|Add work/.test(text(node))), false);
    h.dispose();
  }
});

for (const presentation of ['mobile', 'web']) test(`${presentation} month navigation jumps into the continuous list with authorized days and profile header clearance`, () => {
  const visible = project('visible', '2026-10-13'), sameDay = project('same-day', '2026-10-13'), hidden = project('hidden', '1990-01-01', { isPubliclyVisible: false });
  const h = viewHarness({ profile: { ...profile, projects: [visible, sameDay, hidden] }, owner: false, onOpen() {}, presentation, events: [{ id: 'citation', date: '2024-02-29', href: '/citation', label: 'Existing public citation' }] });
  assert.equal(h.nodes.some(node => node.type === 'journey-calendar'), false);assert.equal(yearSections(h).length, 2);
  sortButton(h, 'Oldest first').props.onClick();h.button('Open Timeline calendar for today').props.onClick();h.frames();
  assert.deepEqual(h.scrolls, [], 'Opening Today cannot move the continuous list.');
  const month = h.nodes.find(node => node.type === 'month-calendar');
  assert.deepEqual(Array.from(month.props.days, ([day]) => day), ['2024-02-29', '2026-10-13']);
  assert.equal(month.props.days.flatMap(([, entries]) => entries).some(item => item.project?.id === hidden.id), false);
  month.props.onSelect('2020-01-01');h.frames();assert.equal(h.scrolls.at(-1).day, '2024-02-29');
  assert.equal(timelineOrder(h), 'oldest');
  for (let request = 0; request < 2; request++) {
    const previous = h.scrolls.length;
    h.button('Open Timeline calendar for today').props.onClick();
    h.nodes.find(node => node.type === 'month-calendar').props.onSelect('2026-10-13');h.frames();
    assert.equal(h.scrolls.length, previous + 1, 'Each deliberate month selection scrolls once, including repeated same-day picks.');
  }
  assert.equal(h.scrolls.at(-1).day, '2026-10-13');
  assert.equal(h.nodes.filter(node => node.props['data-journey-date'] === '2026-10-13').length, 2);
  assert.equal(h.scrolls.at(-1).options.block, 'start');assert.equal(h.scrolls.at(-1).rowKey, 'project:same-day');
  assert.equal(h.target('2026-10-13').style.scrollMarginTop, '156px');
  const beforeCancel = h.scrolls.length;
  h.button('Open Timeline calendar for today').props.onClick();
  h.nodes.find(node => node.type === 'month-calendar').props.onClose();h.frames();
  assert.equal(h.scrolls.length, beforeCancel, 'Closing the month screen cannot replay a previously consumed date request.');
  h.dispose();
});

test('Timeline agenda shows the title and portal without a description and preserves its selected date when opening a portal', () => {
  const opened = [], portals = [], details = [];
  const works = [entry('early', '2024-02-29'), entry('recent', '2026-10-13')];
  works[0].project.summary = 'The project description must not appear.';
  works[0].project.creationDetails = { answers: { learned: 'The learned description must not appear.' } };
  const h = calendarHarness(works, { onOpen: value => opened.push(value.id), onOpenPortal: value => portals.push(value), onDetails: value => details.push(value.id) });
  h.button('Previous date with work').props.onClick();
  const selected = h.selected(), rows = h.nodes.filter(node => node.type === 'li').map(node => node.key);
  assert.equal(selected, '2024-02-29');
  assert.doesNotMatch(text(h.tree), /description must not appear/);
  const portal = h.nodes.find(node => node.type === 'button' && node.props.children === 'Work');
  assert.ok(portal, 'The project portal is a keyboard-activatable button.');
  assert.equal(portal.props.type, 'button');
  assert.equal(portal.props['aria-haspopup'], 'dialog');
  portal.props.onClick();
  assert.deepEqual(portals, ['portal']);
  assert.deepEqual(opened, [], 'A portal tap must not open a project or change the profile route.');
  assert.deepEqual(details, []);
  assert.equal(h.selected(), selected);
  assert.deepEqual(h.nodes.filter(node => node.type === 'li').map(node => node.key), rows);
  h.button('Open early').props.onClick();
  h.nodes.find(node => node.type === 'button' && node.props.children === 'early').props.onClick();
  h.button('Show details for early').props.onClick();
  assert.deepEqual(opened, ['early', 'early'], 'Cover and title retain the canonical project opening behavior.');
  assert.deepEqual(details, ['early']);
  h.dispose();
});

test('a same-profile refresh removing the open portal releases the Timeline and restoring it does not reopen the popup', () => {
  for (const presentation of ['mobile', 'web']) {
    const viewed = { ...profile, showJourney: true, projects: [project('work', '2026-10-13')] };
    const h = componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', { profile: viewed, owner: false, presentation, onOpen() {} });
    const popup = () => h.nodes.find(node => node.type === 'portal-project-popup');
    sortButton(h, 'Oldest first').props.onClick();
    h.nodes.find(node => node.type === 'button' && node.props.className === 'journey-portal').props.onClick();
    assert.equal(popup().props.categoryId, 'portal');
    const key = h.wrapperKey;
    h.update({ profile: { ...viewed, categories: [] } });
    assert.equal(h.wrapperKey, key, 'This refresh preserves the same Timeline component rather than remounting it.');
    assert.equal(popup(), undefined);
    assert.equal(timelineOrder(h), 'oldest');
    assert.equal(timelineRows(h).length, 1, 'Removing a category cannot remove already-authorized work from the Timeline.');
    h.update({ profile: { ...viewed, categories: [...viewed.categories] } });
    assert.equal(popup(), undefined, 'Restoring a category cannot resurrect its obsolete open-popup request.');
    assert.equal(h.nodes.find(node => node.type === 'button' && node.props.className === 'journey-portal').props['aria-expanded'], false);
    h.dispose();
  }
});

for (const presentation of ['mobile', 'web']) {
  test(`${presentation} Timeline portal popup stays local, preserves list order and date position, and guards project selection`, () => {
    const opened = [];
    const published = project('early', '2024-02-29', { summary: 'Never display this summary.', thenNowCaption: 'Never display this caption.' });
    const recent = project('recent', '2026-10-13', { creationDetails: { answers: { learned: 'Never display this learned line.' } } });
    const hidden = project('hidden', '2026-10-14', { isPubliclyVisible: false });
    const draft = project('draft', '2026-10-14', { sessionOnly: true });
    const other = project('other', '2026-10-14', { categoryId: 'other' });
    const viewed = { ...profile, showJourney: true, thenNow: { then: published.id, now: recent.id }, projects: [published, recent, hidden, draft, other] };
    const h = componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', { profile: viewed, owner: false, presentation, onOpen: value => opened.push(value.id) });
    const popup = () => h.nodes.find(node => node.type === 'portal-project-popup');
    const openPortal = () => h.nodes.find(node => node.type === 'button' && node.props.className === 'journey-portal').props.onClick();
    sortButton(h, 'Oldest first').props.onClick();
    assert.doesNotMatch(text(h.tree), /Never display this/);
    const pair = h.nodes.find(node => node.props.className === 'journey-pair');
    assert.ok(h.nodes.indexOf(pair) > h.nodes.indexOf(yearSections(h).at(-1)), 'Then / Now follows the continuous year list.');
    assert.ok(nodes(pair).some(node => node.type === 'button' && node.props.children === 'Work'), 'Then / Now includes the same portal action.');
    nodes(pair).find(node => node.type === 'button' && node.props['aria-label'] === 'Open Then: early').props.onClick();
    assert.deepEqual(opened, ['early']); opened.length = 0;
    h.button('Open Timeline calendar for today').props.onClick();
    h.nodes.find(node => node.type === 'month-calendar').props.onSelect('2024-02-29'); h.frames();
    const key = h.wrapperKey, position = h.scrolls.at(-1), scrollCount = h.scrolls.length;
    const datedRows = h.nodes.filter(node => node.props['data-journey-date']).map(node => node.key);
    openPortal();
    assert.equal(popup().props.categoryId, 'portal');
    assert.equal(popup().props.backLabel, 'Back to Timeline');
    assert.equal(popup().props.profile.id, viewed.id);
    assert.deepEqual(popup().props.profile.projects.map(value => value.id), ['early', 'recent', 'other']);
    assert.deepEqual(opened, [], 'Opening the Portal Popup does not invoke canonical project navigation.');
    popup().props.onClose();
    assert.equal(popup(), undefined);
    assert.equal(h.wrapperKey, key);
    h.frames();assert.equal(timelineOrder(h), 'oldest');
    assert.equal(h.scrolls.length, scrollCount);assert.equal(h.scrolls.at(-1), position);
    assert.deepEqual(h.nodes.filter(node => node.props['data-journey-date']).map(node => node.key), datedRows);
    openPortal();
    for (const [categoryId, id] of [['portal', 'hidden'], ['portal', 'draft'], ['portal', 'missing'], ['other', 'early'], ['other', 'other']]) popup().props.onSelect(categoryId, id);
    assert.deepEqual(opened, [], 'An injected row cannot select hidden, session-only, nonexistent, or another-portal work.');
    popup().props.onSelect('portal', 'recent');
    assert.deepEqual(opened, ['recent']);
    assert.equal(popup(), undefined);
    openPortal();
    h.update({ profile: { ...viewed, id: 'another-profile' } });
    assert.equal(popup(), undefined, 'Changing the viewed profile closes the old local popup.');
    assert.equal(timelineOrder(h), 'newest');
    assert.equal(h.nodes.some(node => node.type === 'month-calendar'), false);
    openPortal();
    h.update({ owner: true });
    assert.equal(popup(), undefined, 'Changing the access mode closes the old local popup.');
    openPortal();
    assert.deepEqual(popup().props.profile.projects.map(value => value.id), ['early', 'recent', 'hidden', 'other']);
    popup().props.onSelect('portal', 'hidden');
    assert.deepEqual(opened, ['recent', 'hidden'], 'Owners retain their existing access to hidden published work.');
    h.dispose();
  });
}
