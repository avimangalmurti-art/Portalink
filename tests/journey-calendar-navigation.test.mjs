import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const calendar = sourceModule('src/features/journey/calendar.ts');
const journey = sourceModule('src/features/journey/journey.ts');
const portalMembership = sourceModule('src/features/projects/projectPortals.ts');
const timeline = sourceModule('src/features/citations/journeyCitations.ts', { '../journey/journey': journey });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const project = (id, date, patch = {}) => ({ id, categoryId: 'portal', title: id, summary: 'A real project', cover: '', madeOn: date, ...patch });
const profile = { id: 'creator', name: 'Creator', categories: [{ id: 'portal', label: 'Work' }], projects: [] };

/** Execute the actual component with committed refs, effects, state and scroll events. */
function componentHarness(file, name, initial, overrides = {}) {
  const slots = [], frames = new Map(), scrolls = [], targets = new Map();
  const sectionCalls = [];
  let sectionResets = 0;
  let cursor = 0, dirty = true, tree, props = initial, effects = [], lastRefs = [], frameId = 0, wrapperKey;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    lazy: loader => loader.toString().includes('PortalProjectPopup') ? 'portal-project-popup' : 'reorder-timeline-pairs',
    useState(initialValue) { const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }]; },
    useRef(initialValue) { const index = cursor++; slots[index] ??= { current: initialValue }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useEffect(callback, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const root = {};
  const imports = {
    'react-dom':{createPortal:children=>children}, '../../contexts/ServicesContext':{useServices:()=>({})},
    react, 'lucide-react': new Proxy({}, { get: (_target, key) => key }),
    './calendar': calendar, './journey': journey, '../projects/projectPortals': portalMembership,
    '../../components/text/FormattedText': { FormattedText: 'formatted-text' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/Button': { Button: 'button' },
    '../../components/ui/DeferredDialog': { DeferredDialog: 'dialog' },
    '../../components/media/MobileProjectPopup': { MobileProjectPopup: 'project-popup' },
    '../../components/media/ProjectCover': { ProjectCover: 'project-cover' },
    '../../utils/projectPresentation': sourceModule('src/utils/projectPresentation.ts'),
    '../../components/profile/PortalProjectPopup': { PortalProjectPopup: 'portal-project-popup' },
    '../../presentation/usePresentation': { usePresentation: () => props.presentation ?? 'mobile' },
    '../citations/useJourneyCitations': { useJourneyCitations: () => props.events ?? [] },
    '../citations/journeyCitations': timeline,
    './useTimelinePairs': { useTimelinePairs: (profile, owner) => {
      const pair = journey.visiblePair(profile, owner);
      return { pairs: pair ? [{ id: 'legacy', then: pair[0].id, now: pair[1].id }] : [], error: '', loading: false };
    } },
    './useTimelineSection': { useTimelineSection: options => {
      sectionCalls.push(options);
      return { atPairs: Boolean(options.enabled && props.autoAtPairs), reset() { sectionResets++; props = { ...props, autoAtPairs: false }; } };
    } },
    './journey.css': {}, ...overrides,
  };
  const Component = sourceModule(file, imports, {
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
  })[name];
  function target(day) {
    let element = targets.get(day);
    if (!element) { element = { top: 500, style: {}, getBoundingClientRect() { return { top: this.top }; }, scrollIntoView(options) { scrolls.push({ day, options, rowKey: this.rowKey }); } }; targets.set(day, element); }
    return element;
  }
  function commit() {
    lastRefs.forEach(ref => ref(null)); lastRefs = [];
    for (const node of nodes(tree)) {
      const dated = node.props['data-journey-date'];
      if (dated) target(dated);
      if (!node.ref) continue;
      const element = dated ? target(dated) : root;
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
    get tree() { return render(); }, get nodes() { return nodes(render()); }, get wrapperKey() { render(); return wrapperKey; }, scrolls,
    get sectionOptions() { render(); return sectionCalls.at(-1); }, get sectionResets() { return sectionResets; },
    target(day) { render(); return targets.get(day); },
    button(label) { return this.nodes.find(node => node.type === 'button' && node.props['aria-label'] === label); },
    update(next) { props = { ...props, ...next }; dirty = true; return render(); },
    frames() { render(); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); return render(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); lastRefs.forEach(ref => ref(null)); },
  };
}
// FormattedText is a descendant boundary in this harness; its text prop is its
// visible content, so descriptions cannot accidentally disappear from assertions.
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : React.isValidElement(tree) ? tree.type === 'formatted-text' ? tree.props.text : text(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';

const viewHarness = initial => componentHarness('src/features/journey/JourneyView.tsx', 'JourneyView', initial);
const timelineRows = h => h.nodes.filter(node => node.props.className === 'journey-entry');
const yearSections = h => h.nodes.filter(node => node.props.className === 'journey-year');
const sortButton = (h, label) => h.nodes.find(node => node.type === 'button' && (node.props.children === label || node.props.children === ({'Newest first':'Latest','Oldest first':'Oldest'}[label])));
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
  assert.ok(order);assert.equal(nodes(order).filter(node => node.type === 'button').length, presentation==='mobile'?4:2);
  assert.equal(timelineOrder(h), 'newest');assert.equal(sortButton(h, 'Newest first').props['aria-pressed'], true);
  assert.equal(sortButton(h, 'Oldest first').props['aria-pressed'], false);
  assert.deepEqual(yearSections(h).map(node => node.props['aria-label']), ['2026', '2024', '2020', '1990', 'Date not set']);
  assert.deepEqual(yearSections(h).map(node => text(nodes(node).find(child => child.type === 'h2')).trim().replace(/\s+/g, ' ')),
    ['2026 1 project', '2024 2 projects', '2020 0 projects', '1990 1 project', 'Date not set 1 project']);
  const newestRows = timelineRows(h).map(node => node.key);
  assert.deepEqual(newestRows, ['project:new', 'citation:cited', 'project:same-year', 'project:leap', 'citation:citation-only', 'project:old', 'project:undated']);
  assert.doesNotMatch(text(h.tree), /Never list|private|preview|No work recorded|What were you making/);
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
    assert.equal(h.nodes.some(node => node.type === 'button' && /Add work/.test(node.props['aria-label']??text(node))), false);
    h.update({ owner: true });h.button('Show details for work').props.onClick();
    if (presentation === 'mobile') {
      const popup = h.nodes.find(node => node.type === 'project-popup');
      popup.props.onOptions();popup.props.onEditDescription();popup.props.contextHandlers.delete();
      assert.deepEqual(descriptions, ['work']);assert.deepEqual(deleted, ['work']);
    }
    assert.deepEqual(edited, ['work']);assert.deepEqual(opened, []);
    const add=h.nodes.find(node => node.type === 'button' && /Add work/.test(node.props['aria-label']??text(node)));if(presentation==='mobile'){assert.equal(add,undefined);assert.deepEqual(added,[]);}else{add.props.onClick();assert.deepEqual(added,[true]);}h.dispose();
  }
});

test('the year-list parent scopes order and open portal dialogs to the viewed profile and owner mode without scrolling', () => {
  const projects = [project('old', '1990-01-01'), project('leap', '2024-02-29'), project('new', '2026-10-13')];
  for (const presentation of ['mobile', 'web']) {
    const initial = { profile: { ...profile, projects }, owner: true, onOpen() {}, presentation };
    const h = viewHarness(initial);
    assert.equal(h.wrapperKey, 'creator:true');
    sortButton(h, 'Oldest first').props.onClick();assert.equal(timelineOrder(h), 'oldest');
    h.nodes.find(node => node.props.className === 'journey-portal').props.onClick();
    assert.ok(h.nodes.find(node => node.type === 'portal-project-popup'));
    h.update({ profile: { ...initial.profile, id: 'other' } });h.frames();
    assert.equal(h.wrapperKey, 'other:true');assert.equal(timelineOrder(h), 'newest');
    assert.equal(h.nodes.some(node => node.type === 'portal-project-popup'), false);assert.deepEqual(h.scrolls, []);
    sortButton(h, 'Oldest first').props.onClick();
    h.nodes.find(node => node.props.className === 'journey-portal').props.onClick();
    h.update({ owner: false });h.frames();
    assert.equal(h.wrapperKey, 'other:false');assert.equal(timelineOrder(h), 'newest');
    assert.equal(h.nodes.some(node => node.type === 'portal-project-popup'), false);assert.deepEqual(h.scrolls, []);
    h.dispose();
  }
});

test('empty and undated Timelines retain only the two sort controls and owner Add, without a calendar or empty-day placeholders', () => {
  for (const presentation of ['mobile', 'web']) for (const projects of [[], [project('undated', 'invalid')]]) {
    let adds = 0;
    const h = viewHarness({ profile: { ...profile, projects }, owner: true, onOpen() {}, onAdd: () => adds++, presentation });
    assert.equal(h.button('Open Timeline calendar for today'), undefined);
    const toolbar = h.nodes.find(node => node.props.className === 'journey-toolbar');
    assert.deepEqual(nodes(toolbar).filter(node => node.type === 'button').map(node => node.props['aria-label']??text(node)), presentation === 'mobile' ? ['Latest', 'Popular', 'Oldest', 'Then/Now'] : ['Newest first', 'Oldest first']);
    assert.equal(timelineRows(h).length, projects.length);assert.doesNotMatch(text(h.tree), /No work recorded|What were you making/);
    sortButton(h, 'Oldest first').props.onClick();h.frames();assert.deepEqual(h.scrolls, []);
    const add = h.nodes.find(node => node.type === 'button' && /Add your first project|Add work/.test(node.props['aria-label']??text(node)));
    if(presentation==='mobile')assert.equal(add,undefined);else{assert.ok(add);add.props.onClick();assert.equal(adds,1);}
    h.update({ owner: false });assert.equal(h.nodes.some(node => node.type === 'button' && /Add your first project|Add work/.test(node.props['aria-label']??text(node))), false);
    h.dispose();
  }
});

for (const presentation of ['mobile', 'web']) test(`${presentation} Timeline keeps real row dates but exposes only sorting with no Today, calendar or automatic date jumps`, () => {
  const visible = project('visible', '2026-10-13'), sameDay = project('same-day', '2026-10-13'), hidden = project('hidden', '1990-01-01', { isPubliclyVisible: false });
  const h = viewHarness({ profile: { ...profile, projects: [visible, sameDay, hidden] }, owner: false, onOpen() {}, presentation, events: [{ id: 'citation', date: '2024-02-29', href: '/citation', label: 'Existing public citation' }] });
  assert.equal(yearSections(h).length, 2);
  h.frames();assert.deepEqual(h.scrolls, [], 'Opening a Timeline cannot jump to a date.');
  const toolbar = h.nodes.find(node => node.props.className === 'journey-toolbar');
  assert.deepEqual(nodes(toolbar).filter(node => node.type === 'button').map(node => text(node)), presentation==='mobile'?['Latest','Popular','Oldest','Then/Now']:['Newest first','Oldest first']);
  assert.equal(h.button('Open Timeline calendar for today'), undefined);
  assert.equal(h.nodes.some(node => node.type === 'input' && node.props.type === 'date'), false);
  assert.deepEqual(timelineRows(h).map(node => node.props['data-journey-date']), ['2026-10-13', '2026-10-13', '2024-02-29']);
  assert.deepEqual(h.nodes.filter(node => node.type === 'time').map(node => node.props.dateTime), ['2026-10-13', '2026-10-13', '2024-02-29']);
  sortButton(h, 'Oldest first').props.onClick();h.frames();assert.equal(timelineOrder(h), 'oldest');
  assert.deepEqual(timelineRows(h).map(node => node.props['data-journey-date']), ['2024-02-29', '2026-10-13', '2026-10-13']);
  assert.equal(timelineRows(h).some(node => node.key === 'project:hidden'), false);
  assert.equal(h.nodes.filter(node => node.props['data-journey-date'] === '2026-10-13').length, 2);
  sortButton(h, 'Newest first').props.onClick();h.frames();assert.equal(timelineOrder(h), 'newest');
  assert.deepEqual(h.scrolls, [], 'Sorting never schedules a date jump or invokes scrolling.');
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
    const featured = project('featured', '2026-10-15', { categoryId: 'other', additionalPortalIds: ['portal'] });
    const viewed = { ...profile, showJourney: true, thenNow: { then: published.id, now: recent.id }, projects: [published, recent, hidden, draft, other, featured] };
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
    h.frames();assert.deepEqual(h.scrolls, []);
    const key = h.wrapperKey, position = h.target('2024-02-29');position.top = 176;
    const scrollCount = h.scrolls.length;
    const datedRows = h.nodes.filter(node => node.props['data-journey-date']).map(node => node.key);
    openPortal();
    assert.equal(popup().props.categoryId, 'portal');
    assert.equal(popup().props.backLabel, 'Back to Timeline');
    assert.equal(popup().props.profile.id, viewed.id);
    assert.deepEqual(popup().props.profile.projects.map(value => value.id), ['early', 'recent', 'other', 'featured']);
    assert.deepEqual(opened, [], 'Opening the Portal Popup does not invoke canonical project navigation.');
    popup().props.onClose();
    assert.equal(popup(), undefined);
    assert.equal(h.wrapperKey, key);
    h.frames();assert.equal(timelineOrder(h), 'oldest');
    assert.equal(h.scrolls.length, scrollCount);assert.equal(h.target('2024-02-29'), position);assert.equal(position.top, 176);
    assert.deepEqual(h.nodes.filter(node => node.props['data-journey-date']).map(node => node.key), datedRows);
    openPortal();
    for (const [categoryId, id] of [['portal', 'hidden'], ['portal', 'draft'], ['portal', 'missing'], ['portal', 'other'], ['other', 'early'], ['other', 'other']]) popup().props.onSelect(categoryId, id);
    assert.deepEqual(opened, [], 'An injected row cannot select hidden, session-only, nonexistent, or another-portal work.');
    popup().props.onSelect('portal', 'recent');
    assert.deepEqual(opened, ['recent']);
    assert.equal(popup(), undefined);
    openPortal();
    popup().props.onSelect('portal', 'featured');
    assert.deepEqual(opened, ['recent', 'featured']);
    assert.equal(popup(), undefined);
    openPortal();
    h.update({ profile: { ...viewed, id: 'another-profile' } });
    assert.equal(popup(), undefined, 'Changing the viewed profile closes the old local popup.');
    assert.equal(timelineOrder(h), 'newest');
    openPortal();
    h.update({ owner: true });
    assert.equal(popup(), undefined, 'Changing the access mode closes the old local popup.');
    openPortal();
    assert.deepEqual(popup().props.profile.projects.map(value => value.id), ['early', 'recent', 'hidden', 'other', 'featured']);
    popup().props.onSelect('portal', 'hidden');
    assert.deepEqual(opened, ['recent', 'featured', 'hidden'], 'Owners retain their existing access to hidden published work.');
    h.dispose();
  });
}


test('mobile Timeline has four view buttons and no creation actions for owner or visitor', () => {
 const h=viewHarness({profile:{...profile,projects:[]},owner:true,presentation:'mobile',onOpen(){},onAdd:()=>assert.fail('unexpected create'),onPair:()=>assert.fail('unexpected pair')});
 const toolbar=h.nodes.find(node=>node.props.className==='journey-toolbar');
 const controls=nodes(toolbar).filter(node=>node.type==='button');
 assert.equal(toolbar.type,'header');assert.deepEqual(controls.map(node=>text(node)),['Latest','Popular','Oldest','Then/Now']);
 assert.equal(controls[1].props.disabled,true,'Unavailable opens must not use a fake ranking');
 assert.equal(h.button('Add work'),undefined);assert.equal(h.button('Choose a Then/Now pair'),undefined);
 h.update({owner:false});assert.equal(h.button('Add work'),undefined);h.dispose();
});

test('shared mobile Timeline omits Popular while preserving the three native controls and existing row actions', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01'), opened=[];
 const h=viewHarness({profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:false,showPopular:false,presentation:'mobile',onOpen:work=>opened.push(work.id)});
 const controls=()=>nodes(h.nodes.find(node=>node.props.className==='journey-toolbar')).filter(node=>node.type==='button');
 assert.deepEqual(controls().map(text),['Latest','Oldest','Then/Now']);
 assert.ok(controls().every(node=>node.props.type==='button'&&node.props.disabled!==true&&node.props.tabIndex===undefined),'All remaining controls retain ordinary keyboard tab access.');
 assert.equal(sortButton(h,'Latest').props['aria-pressed'],true);
 assert.deepEqual(timelineRows(h).map(node=>node.key),['project:recent','project:early']);
 const key=h.wrapperKey;
 sortButton(h,'Oldest').props.onClick(); h.frames();
 assert.equal(h.wrapperKey,key); assert.equal(timelineOrder(h),'oldest');
 assert.equal(sortButton(h,'Oldest').props['aria-pressed'],true);
 assert.deepEqual(timelineRows(h).map(node=>node.key),['project:early','project:recent']);
 h.nodes.find(node=>node.props.className==='journey-title'&&text(node)==='early').props.onClick();
 assert.deepEqual(opened,['early']);
 h.button('Show details for early').props.onClick();
 assert.ok(h.nodes.find(node=>node.type==='project-popup'));
 h.nodes.find(node=>node.type==='project-popup').props.onClose();
 sortButton(h,'Then/Now').props.onClick(); h.frames();
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true);
 assert.equal(timelineRows(h).length,0); assert.equal(h.nodes.filter(node=>node.props.className==='journey-pair').length,1);
 sortButton(h,'Latest').props.onClick(); h.frames();
 assert.equal(sortButton(h,'Latest').props['aria-pressed'],true); assert.equal(timelineRows(h).length,2);
 h.update({autoAtPairs:true});
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true); assert.equal(timelineRows(h).length,2);
 h.update({autoAtPairs:false}); assert.equal(sortButton(h,'Latest').props['aria-pressed'],true);
 assert.deepEqual(h.scrolls,[],'Removing the unavailable action does not add any scroll writes.');
 h.update({presentation:'web'});
 assert.deepEqual(controls().map(text),['Newest first','Oldest first']);
 assert.equal(h.sectionOptions.enabled,false); h.dispose();
});

test('Popular shows authorized open counts only while selected',async()=>{
 const reads={list:async()=>[{profileId:'creator',projectId:'older-hit',opened:50},{profileId:'creator',projectId:'recent-tie',opened:5},{profileId:'creator',projectId:'older-tie',opened:5},{profileId:'other',projectId:'zero',opened:999}]};
 const h=componentHarness('src/features/journey/JourneyView.tsx','JourneyView',{profile:{...profile,projects:[project('older-hit','2020-01-01'),project('recent-tie','2026-01-01'),project('older-tie','2025-01-01'),project('zero','2024-01-01')]},owner:true,presentation:'mobile',onOpen(){}},{'../../contexts/ServicesContext':{useServices:()=>({reads})}});
 assert.equal(h.nodes.some(n=>n.props.className==='journey-popularity'),false);await new Promise(setImmediate);h.update({});
 h.nodes.find(n=>n.type==='button'&&text(n)==='Popular').props.onClick();
 assert.deepEqual(h.nodes.filter(n=>n.props.className==='journey-popularity').map(n=>text(n).trim()),['50','5','5','0']);
 h.nodes.find(n=>n.type==='button'&&text(n)==='Oldest').props.onClick();assert.equal(h.nodes.some(n=>n.props.className==='journey-popularity'),false);
 h.update({owner:false});assert.equal(h.nodes.some(n=>n.props.className==='journey-popularity'),false);h.dispose();
});

test('Then/Now filters out ordinary Timeline entries and another view restores them', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01');
 const h=viewHarness({profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:false,presentation:'mobile',onOpen(){}});
 assert.equal(timelineRows(h).length,2);
 sortButton(h,'Then/Now').props.onClick();h.frames();
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true);
 assert.equal(sortButton(h,'Latest').props['aria-pressed'],false);
 assert.equal(timelineRows(h).length,0);
 assert.equal(h.nodes.filter(n=>n.props.className==='journey-pair').length,1);
 sortButton(h,'Latest').props.onClick();h.frames();
 assert.equal(timelineRows(h).length,2);
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],false);
 h.update({profile:{...profile,projects:[]}});
 sortButton(h,'Then/Now').props.onClick();h.frames();
 assert.match(text(h.tree),/No Then\/Now pairs yet/);
 h.dispose();
});

test('mobile automatic Then/Now indication preserves the continuous rows, selected order and reading position', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01');
 const h=viewHarness({profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:false,presentation:'mobile',onOpen(){}});
 const key=h.wrapperKey, first=h.target('2026-01-01'); first.top=-74;
 const rows=timelineRows(h).map(node=>node.key);
 assert.equal(h.sectionOptions.enabled,true);
 h.update({autoAtPairs:true});
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true);
 assert.equal(sortButton(h,'Latest').props['aria-pressed'],false);
 assert.equal(timelineOrder(h),'newest');
 assert.deepEqual(timelineRows(h).map(node=>node.key),rows,'Automatic indication must not activate the explicit pair-only filter.');
 assert.equal(h.wrapperKey,key); assert.equal(h.target('2026-01-01'),first); assert.equal(first.top,-74);
 assert.deepEqual(h.scrolls,[],'The indicator cannot scroll, reorder or open work.');
 h.update({autoAtPairs:false});
 assert.equal(sortButton(h,'Latest').props['aria-pressed'],true);
 sortButton(h,'Oldest').props.onClick(); h.frames();
 const oldRows=timelineRows(h).map(node=>node.key), resets=h.sectionResets;
 h.update({autoAtPairs:true});
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true); assert.equal(timelineOrder(h),'oldest');
 assert.deepEqual(timelineRows(h).map(node=>node.key),oldRows);
 h.update({autoAtPairs:false}); assert.equal(sortButton(h,'Oldest').props['aria-pressed'],true);
 h.update({autoAtPairs:true}); sortButton(h,'Latest').props.onClick(); h.frames();
 assert.equal(h.sectionResets,resets+1); assert.equal(sortButton(h,'Latest').props['aria-pressed'],true);
 assert.deepEqual(h.scrolls,[]); h.dispose();
});

test('mobile automatic indication does not replace explicit Then/Now filtering and is paused behind local popups', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01');
 const h=viewHarness({profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:false,presentation:'mobile',onOpen(){}});
 h.update({autoAtPairs:true}); sortButton(h,'Then/Now').props.onClick(); h.frames();
 assert.equal(h.sectionOptions.enabled,false); assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true);
 assert.equal(timelineRows(h).length,0,'Only an explicit Then/Now activation removes ordinary rows.');
 sortButton(h,'Oldest').props.onClick(); h.frames(); assert.equal(timelineRows(h).length,2);
 assert.equal(h.sectionOptions.enabled,true); assert.equal(sortButton(h,'Oldest').props['aria-pressed'],true);
 h.update({autoAtPairs:true});
 h.button('Show details for early').props.onClick(); assert.equal(h.sectionOptions.paused,true);
 assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true,'Opening details preserves the current indication.');
 h.nodes.find(node=>node.type==='project-popup').props.onClose(); assert.equal(h.sectionOptions.paused,false);
 h.nodes.find(node=>node.props.className==='journey-portal').props.onClick(); assert.equal(h.sectionOptions.paused,true);
 h.nodes.find(node=>node.type==='portal-project-popup').props.onClose(); assert.equal(h.sectionOptions.paused,false);
 h.update({active:false}); assert.equal(h.sectionOptions.enabled,false);
 h.update({active:true,profile:{...profile,projects:[early,recent]}}); assert.equal(h.sectionOptions.enabled,false,'No pair means no automatic tracking.');
 assert.deepEqual(h.scrolls,[]); h.dispose();
});

test('WEB never enables automatic Then/Now tracking or changes its selected order from an injected mobile indication', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01');
 const h=viewHarness({profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:false,presentation:'web',autoAtPairs:true,onOpen(){}});
 assert.equal(h.sectionOptions.enabled,false); assert.equal(sortButton(h,'Then/Now'),undefined);
 assert.equal(sortButton(h,'Newest first').props['aria-pressed'],true); assert.equal(timelineRows(h).length,2);
 sortButton(h,'Oldest first').props.onClick(); h.frames(); assert.equal(sortButton(h,'Oldest first').props['aria-pressed'],true);
 assert.equal(h.sectionOptions.enabled,false); assert.equal(timelineRows(h).length,2); assert.deepEqual(h.scrolls,[]); h.dispose();
});

test('mobile owners can edit the specific pair while visitors and desktop keep their existing controls', () => {
 const early=project('early','2020-01-01'), recent=project('recent','2026-01-01'), other=project('other','2025-01-01');
 const viewed={...profile,showJourney:true,projects:[early,recent,other]};
 const pairs=[{id:'legacy',then:early.id,now:recent.id},{id:'second',then:other.id,now:recent.id}];
 const edits=[], opened=[], focus=[];
 const saveOrder=async()=>{};
 let manages=0;
 const h=componentHarness('src/features/journey/JourneyView.tsx','JourneyView',{
   profile:viewed,owner:true,presentation:'mobile',onOpen:project=>opened.push(project.id),
   onPair:()=>manages++,onEditPair:record=>edits.push(record),
 },{
   './useTimelinePairs':{useTimelinePairs:()=>({pairs,error:'',loading:false,saveOrder})},
 });
 const edit=()=>h.nodes.filter(node=>node.type==='button' && node.props.children==='Edit pair');
 assert.equal(edit().length,2);
 const second=h.button('Edit pair: other and recent');
 assert.equal(second.props['aria-haspopup'],'dialog');
 second.props.onClick({currentTarget:{focus:options=>focus.push(options.preventScroll)}});
 assert.deepEqual(edits,[pairs[1]]);
 assert.deepEqual(focus,[true]);
 h.button('Open Then: other').props.onClick();
 assert.deepEqual(opened,[other.id]);
 const reorder=()=>sortButton(h,'Reorder pairs');
 assert.equal(reorder(),undefined);
 sortButton(h,'Then/Now').props.onClick();
 assert.equal(reorder().props['aria-haspopup'],'dialog');
 reorder().props.onClick({currentTarget:{focus:options=>focus.push(options.preventScroll)}});
 assert.ok(h.nodes.some(node=>node.props.saveOrder===saveOrder));
 h.update({owner:false}); assert.equal(edit().length,0);
 sortButton(h,'Then/Now').props.onClick(); assert.equal(reorder(),undefined);
 h.update({owner:true,presentation:'web'}); assert.equal(edit().length,0);
 assert.equal(reorder(),undefined);
 h.nodes.find(node=>node.props.children==='Manage pairs').props.onClick();
 assert.equal(manages,1);
 h.dispose();
});

test('automatic Then/Now indication returns to Popular without refetching counts or replacing its ranked rows',async()=>{
 let readsCount=0;
 const early=project('early','2020-01-01'),recent=project('recent','2026-01-01');
 const reads={list:async()=>{readsCount++;return [{profileId:'creator',projectId:early.id,opened:20},{profileId:'creator',projectId:recent.id,opened:3}];}};
 const h=componentHarness('src/features/journey/JourneyView.tsx','JourneyView',{profile:{...profile,showJourney:true,thenNow:{then:early.id,now:recent.id},projects:[early,recent]},owner:true,presentation:'mobile',onOpen(){}},{'../../contexts/ServicesContext':{useServices:()=>({reads})}});
 h.tree; await new Promise(setImmediate); h.update({}); sortButton(h,'Popular').props.onClick(); h.frames();
 assert.equal(sortButton(h,'Popular').props['aria-pressed'],true);
 const rows=timelineRows(h).map(node=>node.key),ranks=h.nodes.filter(node=>node.props.className==='journey-popularity').map(text);
 h.update({autoAtPairs:true}); assert.equal(sortButton(h,'Then/Now').props['aria-pressed'],true); assert.equal(sortButton(h,'Popular').props['aria-pressed'],false);
 assert.equal(timelineOrder(h),'popular'); assert.deepEqual(timelineRows(h).map(node=>node.key),rows);
 assert.deepEqual(h.nodes.filter(node=>node.props.className==='journey-popularity').map(text),ranks);
 h.update({autoAtPairs:false}); assert.equal(sortButton(h,'Popular').props['aria-pressed'],true);
 assert.equal(readsCount,1); assert.deepEqual(h.scrolls,[]); h.dispose();
});
