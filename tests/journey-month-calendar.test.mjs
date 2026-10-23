import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { sourceModule } from './helpers/source-module.mjs';

const calendar = sourceModule('src/features/journey/calendar.ts', {}, { Date, Map });
const project = (id, categoryId = 'work') => ({ kind: 'project', date: '2026-10-14', project: { id, categoryId, title: id } });
const citation = id => ({ kind: 'citation', date: '2026-10-18', event: { id, label: 'A real citation', href: '/cite/real' } });
function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
function fixture(presentation = 'mobile', days = [['2026-10-14', [project('one'), project('two')]], ['2026-10-18', [citation('real')]], ['2026-11-04', [project('next', 'photo')]]]) {
  let cursor = 0, effects = [], currentTree;
  const slots = [], selected = [], scrolling = [], focusCalls = [], viewportCalls = [];
  let closed = 0;
  const onClose = () => closed++;
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(value) { return slots[cursor++] ??= { current: value }; }, useMemo: factory => factory(), useLayoutEffect: effect => effects.push(effect),
  };
  const { JourneyMonthCalendar } = sourceModule('src/features/journey/JourneyMonthCalendar.tsx', {
    react, 'lucide-react': { ArrowLeftIcon: 'back-icon', ChevronLeftIcon: 'previous-icon', ChevronRightIcon: 'next-icon', XIcon: 'close-icon' },
    '../../components/ui/ModalPortal': { ModalPortal: 'portal' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => { viewportCalls.push(true); return react.useRef(null); } },
    '../../hooks/useModalFocus': { useModalFocus: (...args) => focusCalls.push(args) },
    '../../presentation/mobile/MobileBackNavigation': { MobileBackScope: 'back-scope', ScreenBack: 'screen-back' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    './calendar': { ...calendar, localToday: () => '2026-10-14' }, './journey-month-calendar.css': {},
  });
  const attachRefs = tree => {
    for (const node of nodes(tree)) {
      const ref = node.ref;
      if (!ref) continue;
      const target = node.props['data-journey-month-day'] ?? (node.props.className === 'journey-month-calendar-month' ? node.props.children[0].props.id.replace('journey-month-', '') : 'dialog');
      const element = { scrollIntoView: options => scrolling.push({ target, options }) };
      if (typeof ref === 'function') ref(element); else ref.current = element;
    }
  };
  return { selected, scrolling, focusCalls, viewportCalls, get closed() { return closed; }, onClose,
    render(nextDays = days) {
      for (const node of nodes(currentTree)) if (typeof node.ref === 'function') node.ref(null);
      cursor = 0; effects = [];
      currentTree = JourneyMonthCalendar({ days: nextDays, onSelect: day => selected.push(day), onClose });
      attachRefs(currentTree); effects.forEach(effect => effect());
      return currentTree;
    },
  };
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
const dayButton = (tree, day) => nodes(tree).find(node => node.props['data-journey-month-day'] === day);

for (const presentation of ['mobile', 'web']) test(`${presentation} month calendar starts at today with Sunday-first current and next months`, () => {
  const f = fixture(presentation), tree = f.render();
  const overlay = nodes(tree).find(node => node.props.className === 'journey-month-calendar-overlay');
  assert.equal(overlay.props['data-presentation'], presentation);
  const headings = nodes(tree).filter(node => node.type === 'h2');
  assert.deepEqual(headings.map(node => node.props.id), ['journey-month-2026-10-01', 'journey-month-2026-11-01']);
  const tables = nodes(tree).filter(node => node.type === 'table');
  for (const table of tables) assert.deepEqual(nodes(table).filter(node => node.type === 'th').map(node => node.props['aria-label']), ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  assert.equal(nodes(tree).filter(node => node.props['data-journey-month-day']).length, 61);
  assert.equal(dayButton(tree, '2026-10-14').props['aria-current'], 'date');
  assert.equal(nodes(tree).find(node => node.props.role === 'dialog').props['aria-labelledby'], 'journey-month-calendar-title journey-month-2026-10-01');
});

test('month marks preserve only supplied authorized project/citation days, deduplicate records, and leave empty days disabled', () => {
  const f = fixture('mobile', [['2026-10-14', [project('one'), project('two')]], ['2026-10-14', [project('one')]], ['2026-10-18', [citation('real')]], ['invalid', [project('invalid')]], ['1990-01-01', [project('older')]]]);
  const tree = f.render(), posted = dayButton(tree, '2026-10-14'), cited = dayButton(tree, '2026-10-18'), empty = dayButton(tree, '2026-10-15');
  assert.equal(posted.props.disabled, false); assert.match(posted.props['aria-label'], /2 posted projects/);
  assert.equal(nodes(posted).filter(node => node.props['data-work-category'] === 'work').length, 1);
  assert.equal(cited.props.disabled, false); assert.match(cited.props['aria-label'], /1 citation/);
  assert.equal(nodes(cited).filter(node => node.props['data-work-category'] === 'citation').length, 1);
  posted.props.onClick(); cited.props.onClick(); empty.props.onClick();
  assert.deepEqual(f.selected, ['2026-10-14', '2026-10-18']);
  assert.equal(empty.props.disabled, true); assert.equal(empty.props['data-has-work'], undefined);
  assert.doesNotMatch(empty.props['aria-label'], /No Timeline|No posted|No work/);
  assert.equal(f.closed, 0, 'The parent owns closure and the real agenda jump after selection.');
  assert.equal(nodes(tree).some(node => node.props['data-journey-month-day'] === '1990-01-01'), false);
});

test('month navigation scrolls its heading and Today returns to the current month/date without selecting nonexistent work', () => {
  const f = fixture(), initial = f.render();
  button(initial, 'Next month').props.onClick();
  const next = f.render(); assert.equal(nodes(next).find(node => node.type === 'h2').props.id, 'journey-month-2026-11-01');
  assert.deepEqual(JSON.parse(JSON.stringify(f.scrolling.at(-1))), { target: '2026-11-01', options: { block: 'start', behavior: 'instant' } });
  button(next, 'Today').props.onClick();
  const today = f.render(); assert.equal(nodes(today).find(node => node.type === 'h2').props.id, 'journey-month-2026-10-01');
  assert.deepEqual(JSON.parse(JSON.stringify(f.scrolling.at(-1))), { target: '2026-10-14', options: { block: 'center', behavior: 'instant' } });
  button(today, 'Today').props.onClick(); assert.equal(f.scrolling.at(-1).target, '2026-10-14');
  assert.deepEqual(f.selected, []);
  button(today, 'Previous month').props.onClick(); assert.equal(nodes(f.render()).find(node => node.type === 'h2').props.id, 'journey-month-2026-09-01');
});

test('modal uses shared Escape/focus-return lifecycle, native keyboard controls and an active mobile Back scope', () => {
  for (const presentation of ['mobile', 'web']) {
    const f = fixture(presentation), tree = f.render();
    assert.equal(tree.type, 'back-scope'); assert.equal(tree.props.active, true); assert.equal(tree.props.enabled, true);
    const modal = nodes(tree).find(node => node.props.role === 'dialog');
    assert.equal(String(modal.props['aria-modal']), 'true'); assert.equal(modal.props.tabIndex, -1);
    assert.deepEqual(f.focusCalls.map(call => [call[0], call[2] === f.onClose, call[3]]), [[true, true, true]]);
    assert.equal(f.viewportCalls.length, 1);
    for (const control of nodes(tree).filter(node => node.type === 'button')) assert.equal(control.props.type, 'button');
    const back = nodes(tree).find(node => node.type === 'screen-back'); assert.equal(back.props.action, f.onClose); assert.equal(back.props.visibleOnMobile, true);
    button(tree, presentation === 'mobile' ? 'Back to Timeline' : 'Close calendar').props.onClick();
    f.focusCalls[0][2](); assert.equal(f.closed, 2, 'Button and Escape share the same close callback.');
    const overlay = nodes(tree).find(node => node.props.className === 'journey-month-calendar-overlay');
    const backdrop = {}; overlay.props.onPointerDown({ target: {}, currentTarget: backdrop }); assert.equal(f.closed, 2);
    overlay.props.onPointerDown({ target: backdrop, currentTarget: backdrop }); assert.equal(f.closed, presentation === 'web' ? 3 : 2);
  }
});

test('month screen styling scopes full viewport/safe areas to MOBILE and retains a roomy WEB dialog and hairlines', () => {
  const css = readFileSync(new URL('../src/features/journey/journey-month-calendar.css', import.meta.url), 'utf8');
  assert.match(css, /--dialog-viewport-height/); assert.match(css, /safe-area-inset-top/); assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /width: min\(760px, 100%\)/); assert.match(css, /overflow-y: auto; overscroll-behavior: contain/);
  assert.match(css, /tbody > tr \{ border-top: 1px solid var\(--hairline\)/);
  assert.match(css, /data-presentation='mobile'[^}]+width: 100%; height: 100%; border: 0; border-radius: 0/);
  assert.doesNotMatch(css, /journey-year|journey-entry|\.user-profile|(?:^|\n)button\s*\{/);
});
