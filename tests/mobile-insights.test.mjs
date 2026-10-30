import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join('') : '';
const accessibleText = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : React.isValidElement(tree) && tree.props['aria-hidden'] !== true && tree.props['aria-hidden'] !== 'true' ? React.Children.toArray(tree.props.children).map(accessibleText).join('') : '';
const metricButtons = tree => nodes(tree).filter(node => node.type === 'button' && 'aria-pressed' in node.props);
const headline = tree => nodes(tree).find(node => node.props.className === 'insights-headline');
const chartButtons = chart => React.Children.toArray(chart.props.children).filter(node => React.isValidElement(node) && node.type === 'button');
const totals = tree => nodes(nodes(tree).find(node => node.props['aria-label'] === 'Metric totals')).filter(node => node.type === 'dd').map(node => node.props['aria-label'] ?? text(node));
const hasClass = (node, name) => node.props.className?.split(' ').includes(name);
const activitySection = tree => nodes(tree).find(node => node.type === 'section' && node.props['aria-label'] === 'Project activity');
const activityCard = tree => nodes(activitySection(tree)).find(node => hasClass(node, 'insights-data-surface'));
function load(rows, { error, loading = false, refreshing = false, coverLoading = false, coverRefreshing = false, fetchedAt, initialPeriod, presentation = 'web', active = true, pullLabel = '' } = {}) {
  const states = []; let cursor = 0, queryCursor = 0; const periods = [];
  const environment = { presentation, active, pullLabel };
  const queryState = { error, loading, refreshing, coverLoading, coverRefreshing };
  const refreshCounts = { reads: 0, covers: 0, saves: 0 };
  const surfaceRef = { current: null };
  const pullCalls = [];
  const defaultSaves = { data: { creatorSaves: 9, projectSaves: 7, followers: 3 }, loading: false, retry() { refreshCounts.saves++; } };
  const navigations = [];
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/library/MobileInsights.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return { ...React, useRef: () => surfaceRef, useCallback: fn => fn, useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } };
    if (name === 'react-router-dom') return { useNavigate: () => path => navigations.push(path) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ reads: { list(period) { periods.push(period); return Promise.resolve(rows); } }, projects: { listProjects: async () => [] } }) };
    if (name.endsWith('/useAccountQuery')) return { useAccountQuery: query => { const index = queryCursor++; if(index===0) query(); return { data: index===0 ? rows : [{ id: 'b', cover: '/cover.jpg', coverAlt: 'B artwork' }], error: index===0 ? queryState.error : undefined, loading: index===0 ? queryState.loading : queryState.coverLoading, refreshing: index===0 ? queryState.refreshing : queryState.coverRefreshing, fetchedAt: index===0 ? fetchedAt : undefined, retry: () => refreshCounts[index===0 ? 'reads' : 'covers']++ }; } };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => environment.presentation };
    if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => environment.active };
    if (name.endsWith('/useHomePullRefresh')) return { useHomePullRefresh: (ref, enabled, busy, refresh, onPull, scrollTop) => { pullCalls.push({ ref, enabled, busy, refresh, onPull, scrollTop }); return enabled ? environment.pullLabel : ''; } };
    if (name.endsWith('/readSignal')) return { READ_PERIODS: [{key:'today',label:'Today'},{key:'7d',label:'7 days'},{key:'30d',label:'30 days'},{key:'12m',label:'12 months'},{key:'all',label:'All time'}] };
    if (name.endsWith('/ProjectCover')) return { ProjectCover: 'ProjectCover' };
    if (name.endsWith('/projectPresentation')) return { getProjectCoverPreview: () => undefined };
    if (name.endsWith('/worldOutline')) return { worldOutline: [] };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: 'icon' };
    if (name.endsWith('/StateViews')) return { LoadingState: 'loading', ErrorState: 'error' };
    if (name.endsWith('.css')) return {};
    if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => key });
    throw new Error(name);
  } });
  return { render(saves = defaultSaves) { cursor = queryCursor = 0; return exports.MobileInsights({ saves, initialPeriod }); }, navigations, periods, environment, queryState, refreshCounts, surfaceRef, pull: () => pullCalls.at(-1), refreshes: () => refreshCounts.reads + refreshCounts.covers };
}
const rows = [
  { projectId: 'a', title: 'A', opened: 2, finished: 1, saved: 4, refs: { messages: 2 } },
  { projectId: 'b', title: 'B', opened: 9, finished: 7, saved: 1, refs: { linkedin: 8, 'own-link': 1 } },
  { projectId: 'c', title: 'C', opened: 0, finished: 0, saved: 0, refs: {} },
  { projectId: 'd', title: 'D', opened: 1, finished: 0, saved: 0, refs: { other: 1 } },
];
test('shared insights ranks actual reads, switches metrics, expands projects and retains drill-down', () => {
  const fixture = load(rows);
  let tree = fixture.render();
  assert.equal(accessibleText(headline(tree)), '12project opens');
  assert.deepEqual(totals(tree), ['12', '8', '5']);
  assert.deepEqual(metricButtons(tree).map(text), ['Opens', 'Completed', 'Page saves']);
  const top = nodes(tree).find(node => node.props['aria-label'] === 'Top projects');
  assert.deepEqual(nodes(top).filter(node => node.type === 'strong').map(text), ['B', 'A', 'D']);
  nodes(top).find(node => node.type === 'li').props.children.props.onClick();
  assert.equal(fixture.navigations[0], '/insights?project=b&period=7d');
  nodes(top).find(node => node.props['aria-expanded'] === false).props.onClick();
  tree = fixture.render();
  assert.equal(nodes(nodes(tree).find(node => node.props['aria-label'] === 'Top projects')).filter(node => node.type === 'li').length, 4);
  const buttons = metricButtons(tree);
  buttons[1].props.onClick();
  assert.equal(accessibleText(headline(fixture.render())), '8completed reads');
  buttons[2].props.onClick();
  tree = fixture.render();
  assert.equal(accessibleText(headline(tree)), '5current page saves');
  assert.match(text(tree), /not saves made during this period/);
  assert.match(text(tree), /Reader and saver identities remain private/);
  assert.match(text(tree), /Location insights are not available/);
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Refresh').props.onClick();
  assert.equal(fixture.refreshes(), 2);
});
test('loading and failures do not fabricate zero read metrics; genuine empty data is explained', () => {
  for (const state of [{ loading: true }, { error: 'Unavailable' }]) {
    const fixture = load(undefined, state);
    const tree = fixture.render();
    assert.equal(headline(tree), undefined);
    assert.equal(metricButtons(tree).length, 0);
    assert.equal(nodes(tree).some(node => node.props.className === 'insights-chart' || node.props.className === 'insights-bar'), false);
    assert.equal(nodes(tree).some(node => node.props['aria-label'] === 'Metric totals'), false);
    assert.equal(nodes(tree).some(node => node.type === (state.loading ? 'loading' : 'error')), true);
    if (state.error) {
      const failure = nodes(tree).find(node => node.type === 'error');
      assert.equal(failure.props.description, state.error);
      failure.props.onRetry();
      assert.equal(fixture.refreshes(), 1);
    }
  }
  const empty = load([]).render();
  assert.match(text(empty), /No project reads yet/);
  assert.equal(nodes(empty).some(node => node.props.className === 'insights-bar'), false);
  assert.equal(accessibleText(headline(empty)), '0project opens');
  assert.deepEqual(totals(empty), ['0', '0', '0']);
  assert.equal(nodes(empty).some(node => node.props.className === 'insights-average'), false);
});

test('only the selected heading is accessible while all genuine headings can size the summary', () => {
  const largeRows = [
    { ...rows[0], opened: 9_876_543_210, finished: 1_234_567_890, saved: 98_765_432_109 },
    { ...rows[1], opened: 123_456_789, finished: 12_345_678, saved: 987_654_321 },
  ];
  const fixture = load(largeRows);
  const expectedTotals = Object.fromEntries(['opened', 'finished', 'saved'].map(key => [key, largeRows.reduce((sum, row) => sum + row[key], 0).toLocaleString()]));
  const metricKeys = ['opened', 'finished', 'saved'];
  for (const [period, label] of [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['12m', '12 months'], ['all', 'All time']]) {
    let tree = fixture.render();
    nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.onChange({ target: { value: period } });
    const units = ['project opens', 'completed reads', 'current page saves'];
    const candidates = metricKeys.map((key, index) => `${expectedTotals[key]}${units[index]}`);
    for (const [index, key] of metricKeys.entries()) {
      tree = fixture.render();
      metricButtons(tree)[index].props.onClick();
      tree = fixture.render();
      const heading = headline(tree);
      const spans = React.Children.toArray(heading.props.children).filter(React.isValidElement);
      assert.equal(heading.type, 'h3');
      assert.equal(spans.length, 3);
      assert.deepEqual(spans.map(text), candidates);
      assert.equal(spans.filter(node => node.props['aria-hidden'] !== true && node.props['aria-hidden'] !== 'true').length, 1);
      assert.equal(accessibleText(heading), candidates[index]);
      for (const [candidateIndex, span] of spans.entries()) {
        assert.equal(text(nodes(span).find(node => node.type === 'strong')), expectedTotals[metricKeys[candidateIndex]]);
        assert.equal(text(React.Children.toArray(span.props.children).find(node => node.type === 'span')), units[candidateIndex]);
      }
      assert.deepEqual(totals(tree), metricKeys.map(item => expectedTotals[item]));
      assert.equal(text(nodes(tree).find(node => node.props.className === 'insights-eyebrow')), key === 'saved' ? 'Current totals' : label);
      assert.equal(tree.props['data-insights-metric'], key);
      assert.deepEqual(metricButtons(tree).map(node => node.props['aria-pressed']), metricKeys.map(item => item === key));
    }
  }
});

test('metric styling metadata does not change chart values, ranking, zero bars or period drill-down', () => {
  const fixture = load(rows);
  const definitions = [
    { key: 'opened', label: 'Opens', unit: 'opens' },
    { key: 'finished', label: 'Completed', unit: 'completed reads' },
    { key: 'saved', label: 'Page saves', unit: 'page saves' },
  ];
  for (const period of ['today', '7d', '30d', '12m', 'all']) {
    let tree = fixture.render();
    nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.onChange({ target: { value: period } });
    for (const [index, definition] of definitions.entries()) {
      tree = fixture.render();
      metricButtons(tree)[index].props.onClick();
      tree = fixture.render();
      const chart = nodes(tree).find(node => node.props['aria-label'] === `${definition.label} by project`);
      const buttons = chartButtons(chart);
      const ranked = rows.slice().sort((a, b) => b[definition.key] - a[definition.key] || a.title.localeCompare(b.title));
      const maximum = Math.max(1, ...ranked.map(row => row[definition.key]));
      assert.equal(tree.props['data-insights-metric'], definition.key);
      assert.equal(buttons.length, ranked.length);
      for (const [rowIndex, row] of ranked.entries()) {
        const button = buttons[rowIndex];
        const bar = nodes(button).find(node => node.props.className === 'insights-bar');
        const count = nodes(button).find(node => node.props.className === 'insights-bar-count');
        const label = nodes(button).find(node => node.props.className === 'insights-bar-label');
        assert.equal(bar.props.style.height, `${row[definition.key] / maximum * 100}%`);
        assert.equal(text(count), String(row[definition.key]));
        assert.equal(text(label), String(rowIndex + 1));
        assert.equal(label.props.title, row.title);
        assert.equal(button.props['aria-label'], `${row.title}: ${row[definition.key]} ${definition.unit}. Open project insights`);
        button.props.onClick();
        assert.equal(fixture.navigations.at(-1), `/insights?project=${row.projectId}&period=${period}`);
      }
      const list = nodes(tree).find(node => node.props['aria-label'] === 'Top projects');
      const progress = nodes(list).filter(node => node.props.className === 'insights-progress');
      assert.deepEqual(progress.map(node => node.props.children.props.style.width), ranked.slice(0, 3).map(row => `${row[definition.key] / maximum * 100}%`));
      assert.deepEqual(metricButtons(tree).map(node => node.props['data-insights-series']), definitions.map(item => item.key));
    }
  }
});

test('periods drive queries, project covers load, and only recorded sources appear as data', () => {
  const fixture = load(rows);
  let tree = fixture.render();
  const picker = nodes(tree).find(node => node.props['aria-label'] === 'Insights period');
  assert.equal(picker.props.value, '7d');
  assert.deepEqual(nodes(picker).filter(node => node.type === 'option').map(text), ['Today', '7 days', '30 days', '12 months', 'All time']);
  assert.equal(nodes(tree).find(node => node.type === 'ProjectCover').props.source, '/cover.jpg');
  for (const period of ['today', '7d', '30d', '12m', 'all']) {
    picker.props.onChange({target:{value:period}}); tree = fixture.render();
    assert.equal(fixture.periods.at(-1), period);
  }
  tree = load([{...rows[0], refs:{messages:2, linkedin:0, other:-1, 'own-link':Number.NaN}}]).render();
  const sources = nodes(tree).find(node => node.props['aria-label'] === 'Traffic sources');
  assert.equal(nodes(sources).filter(node => node.type === 'li').length, 1);
  assert.equal(nodes(sources).some(node => node.type === 'a' || node.type === 'button' || node.props.onClick), false);
  assert.equal(nodes(load([{...rows[0], refs:{}}]).render()).some(node => node.props['aria-label'] === 'Traffic sources'), false);
});

test('mobile and web initial periods stay distinct while current saves stay separate from period counts', () => {
  for (const [initialPeriod, expected, label] of [[undefined, '7d', '7 days'], ['30d', '30d', '30 days']]) {
    const fixture = load(rows, { initialPeriod });
    let tree = fixture.render();
    assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.value, expected);
    assert.equal(fixture.periods.at(-1), expected);
    assert.equal(text(nodes(tree).find(node => node.props.className === 'insights-eyebrow')), label);
    assert.equal(text(nodes(tree).find(node => node.props.className === 'insights-total-context')), `Opens and completed: ${label}. Page saves: current bookmarks.`);
    metricButtons(tree)[2].props.onClick();
    tree = fixture.render();
    assert.equal(text(nodes(tree).find(node => node.props.className === 'insights-eyebrow')), 'Current totals');
    assert.equal(accessibleText(headline(tree)), '5current page saves');
    assert.match(accessibleText(nodes(tree).find(node => node.props.className === 'insights-note insights-metric-note')), /current bookmarks, not saves made during this period/);
    const audience = nodes(tree).find(node => node.props['aria-label'] === 'Audience');
    assert.match(text(audience), /Current totals/);
    assert.deepEqual(nodes(audience).filter(node => node.type === 'dt').map(text), ['Creator saves', 'Project saves', 'Followers']);
    assert.deepEqual(nodes(audience).filter(node => node.type === 'dd').map(text).filter(value => /^\d+$/.test(value)), ['9', '7', '3']);
    assert.doesNotMatch(text(tree), /daily average|last week|previous period|this week|\d+% from/i);
  }
});

test('project average includes zero-count projects outside the top eight without inventing time trends', () => {
  const manyRows = Array.from({ length: 10 }, (_, index) => ({
    projectId: `project-${index}`, title: `Project ${index}`, opened: (9 - index) * 10, finished: 0, saved: 0, refs: {},
  }));
  const fixture = load(manyRows);
  let tree = fixture.render();
  const chart = nodes(tree).find(node => node.props['aria-label'] === 'Opens by project');
  assert.equal(chartButtons(chart).length, 8);
  assert.match(text(nodes(tree).find(node => node.props.className === 'insights-chart-caption')), /Top 8 projects/);
  const average = nodes(tree).find(node => node.props.className === 'insights-average');
  assert.equal(text(nodes(average).find(node => node.type === 'strong')), '45');
  assert.match(text(average), /Average per project.*Across all 10 projects/);
  assert.equal(nodes(chart).find(node => node.props.className === 'insights-average-line').props.style.bottom, 'calc(24px + (100% - 24px) * 0.5)');
  assert.deepEqual(totals(tree), ['450', '0', '0']);
  assert.match(text(tree), /Daily trends are not available/);
  assert.equal(nodes(chart).find(node => node.props.className === 'insights-grid').props['aria-hidden'], 'true');
  metricButtons(tree)[1].props.onClick();
  tree = fixture.render();
  const zeroChart = nodes(tree).find(node => node.props['aria-label'] === 'Completed by project');
  assert.equal(text(nodes(nodes(tree).find(node => node.props.className === 'insights-average')).find(node => node.type === 'strong')), '0');
  assert.equal(nodes(zeroChart).find(node => node.props.className === 'insights-average-line').props.style.bottom, 'calc(24px + (100% - 24px) * 0)');
  assert.equal(nodes(zeroChart).filter(node => node.props.className === 'insights-bar').every(node => node.props.style.height === '0%'), true);
});

test('compact chart and legend labels preserve exact accessible totals and project counts', () => {
  for (const count of [9_999, 10_000, 123_456, 975_400_000_000]) {
    const tree = load([{ ...rows[0], opened: count }]).render();
    const chart = nodes(tree).find(node => node.props['aria-label'] === 'Opens by project');
    const compact = count >= 10_000 ? count.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 0 }) : count.toLocaleString();
    assert.equal(text(nodes(chart).find(node => node.props.className === 'insights-bar-count')), compact);
    assert.equal(chartButtons(chart)[0].props['aria-label'], `A: ${count} opens. Open project insights`);
    const total = nodes(nodes(tree).find(node => node.props['aria-label'] === 'Metric totals')).find(node => node.type === 'dd');
    assert.equal(text(total), compact);
    assert.equal(total.props['aria-label'], count.toLocaleString());
    assert.equal(total.props.title, count.toLocaleString());
    assert.equal(totals(tree)[0], count.toLocaleString());
    assert.equal(text(nodes(headline(tree)).find(node => node.type === 'strong')), count.toLocaleString());
  }
});

test('updated time appears only from an actual successful query timestamp', () => {
  for (const fetchedAt of [undefined, null]) {
    assert.equal(nodes(load(rows, { fetchedAt }).render()).some(node => node.type === 'time'), false);
  }
  const fetchedAt = Date.parse('2026-10-22T18:17:00Z');
  const tree = load(rows, { fetchedAt }).render();
  const updated = nodes(tree).find(node => node.props.className === 'insights-updated');
  const time = nodes(updated).find(node => node.type === 'time');
  assert.match(text(updated), /^Updated /);
  assert.equal(time.props.dateTime, new Date(fetchedAt).toISOString());
  assert.equal(text(time), new Date(fetchedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
  for (const state of [{ loading: true }, { error: 'Unavailable' }]) {
    assert.equal(nodes(load(undefined, { ...state, fetchedAt }).render()).some(node => node.type === 'time'), false);
  }
});

test('mobile keeps filters inside the graph card without a visible activity heading while web retains its external controls', () => {
  for (const presentation of ['mobile', 'web']) {
    const fixture = load(rows, { presentation });
    let tree = fixture.render();
    let top = nodes(tree).find(node => node.props.className === 'insights-period');
    let group = nodes(tree).find(node => node.props['aria-label'] === 'Insight metric');
    let picker = nodes(top).find(node => node.props['aria-label'] === 'Insights period');
    const section = activitySection(tree), card = activityCard(tree);
    assert.ok(section, 'Project activity keeps its accessible section name');
    assert.ok(card);
    assert.ok(nodes(card).some(node => node.props['aria-label'] === 'Opens by project'));
    assert.ok(nodes(card).some(node => node.props['aria-label'] === 'Metric totals'));
    assert.equal(nodes(section).filter(node => node.type === 'h2' && text(node) === 'Project activity').length, presentation === 'mobile' ? 0 : 1);
    assert.equal(nodes(card).filter(node => node.props['aria-label'] === 'Insights period').length, presentation === 'mobile' ? 1 : 0);
    assert.equal(metricButtons(card).length, presentation === 'mobile' ? 3 : 0);
    assert.equal(React.Children.toArray(tree.props.children).some(node => React.isValidElement(node) && hasClass(node, 'insights-period')), presentation === 'web');
    if (presentation === 'mobile') {
      const contents = nodes(card);
      assert.ok(contents.findIndex(node => hasClass(node, 'insights-period')) < contents.findIndex(node => hasClass(node, 'insights-headline')), 'Filters precede the graph summary within the same raised card');
    }
    assert.equal(nodes(tree).filter(node => node.props['aria-label'] === 'Insight metric').length, 1);
    assert.equal(group.props.role, 'group');
    assert.equal(group.props['data-ui-shape'], 'capsule');
    assert.deepEqual(metricButtons(group).map(text), ['Opens', 'Completed', 'Page saves']);
    assert.deepEqual(metricButtons(group).map(node => node.props['aria-pressed']), [true, false, false]);
    assert.equal(nodes(top).some(node => node.props['aria-label'] === 'Insight metric'), presentation === 'mobile');
    assert.equal(picker.type, 'select');
    assert.equal(picker.props.value, '7d');
    assert.deepEqual(nodes(picker).filter(node => node.type === 'option').map(node => [node.props.value, text(node)]), [
      ['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['12m', '12 months'], ['all', 'All time'],
    ]);
    assert.equal(nodes(top).filter(node => node.type === 'button' && text(node) === 'Refresh').length, presentation === 'web' ? 1 : 0);
    const label = nodes(top).find(node => node.props.className === 'insights-period-picker');
    if (presentation === 'mobile') {
      assert.equal(label.type, 'label');
      assert.deepEqual(React.Children.toArray(label.props.children).map(node => node.type), ['icon', 'select']);
      assert.equal(nodes(label).find(node => node.type === 'icon').props.icon, 'CalendarDaysIcon');
      assert.equal(label.props.title, 'Insights period: 7 days');
      assert.equal(picker.props.title, 'Insights period: 7 days');
    } else {
      assert.equal(label, undefined);
      assert.equal(nodes(tree).some(node => node.props.role === 'status'), false);
    }
    picker.props.onChange({ target: { value: '30d' } });
    metricButtons(group)[1].props.onClick();
    tree = fixture.render();
    top = nodes(tree).find(node => node.props.className === 'insights-period');
    group = nodes(tree).find(node => node.props['aria-label'] === 'Insight metric');
    picker = nodes(top).find(node => node.props['aria-label'] === 'Insights period');
    assert.equal(picker.props.value, '30d');
    assert.equal(fixture.periods.at(-1), '30d');
    assert.deepEqual(metricButtons(group).map(node => node.props['aria-pressed']), [false, true, false]);
    assert.equal(accessibleText(headline(tree)), '8completed reads');
    if (presentation === 'mobile') assert.equal(picker.props.title, 'Insights period: 30 days');
  }
});

test('pull refresh is enabled only for active mobile Insights and reads its own live scroll container', () => {
  for (const [presentation, active, enabled] of [['web', true, false], ['mobile', false, false], ['mobile', true, true]]) {
    const fixture = load(rows, { presentation, active, pullLabel: 'Release to refresh' });
    const tree = fixture.render();
    const pull = fixture.pull();
    assert.equal(pull.enabled, enabled);
    assert.equal(pull.busy, false);
    assert.equal(pull.ref, fixture.surfaceRef);
    assert.equal(pull.scrollTop(), Infinity, 'a missing mounted surface cannot be treated as the top');
    const owner = { scrollTop: 127 };
    const selectors = [];
    fixture.surfaceRef.current = { closest(selector) { selectors.push(selector); return owner; } };
    assert.equal(pull.scrollTop(), 127, 'the nested scroller wins even when the document is at zero');
    owner.scrollTop = 0;
    assert.equal(pull.scrollTop(), 0, 'the top check reads current scroll position on every gesture event');
    assert.deepEqual(selectors, ['.mobile-insights-scroll', '.mobile-insights-scroll']);
    fixture.surfaceRef.current = { closest: () => null };
    assert.equal(pull.scrollTop(), Infinity, 'a detached or unrelated surface cannot refresh');
    const status = nodes(tree).find(node => node.props.role === 'status');
    if (presentation === 'mobile') assert.equal(text(status), enabled ? 'Release to refresh' : '');
    else assert.equal(status, undefined);
  }
  const fixture = load(rows, { presentation: 'mobile' });
  fixture.render();
  assert.equal(fixture.pull().enabled, true);
  fixture.environment.active = false;
  fixture.render();
  assert.equal(fixture.pull().enabled, false, 'retaining an inactive Insights screen disables its gesture');
  fixture.environment.active = true;
  fixture.environment.presentation = 'web';
  fixture.render();
  assert.equal(fixture.pull().enabled, false, 'switching presentation relinquishes the mobile gesture');
});

test('mobile pull feedback refreshes all three queries once while retaining the selected metric and period', () => {
  const fixture = load(rows, { presentation: 'mobile', pullLabel: 'Pull to refresh' });
  let tree = fixture.render();
  nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.onChange({ target: { value: '12m' } });
  metricButtons(tree)[2].props.onClick();
  tree = fixture.render();
  let status = nodes(tree).find(node => node.props.role === 'status');
  assert.equal(status.props['aria-live'], 'polite');
  assert.equal(text(status), 'Pull to refresh');
  fixture.environment.pullLabel = 'Release to refresh';
  tree = fixture.render();
  assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), 'Release to refresh');
  fixture.pull().refresh();
  assert.deepEqual(fixture.refreshCounts, { reads: 1, covers: 1, saves: 1 });
  fixture.environment.pullLabel = '';
  fixture.queryState.refreshing = true;
  tree = fixture.render();
  assert.equal(fixture.pull().busy, true);
  assert.equal(tree.props['aria-busy'], true);
  assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), 'Refreshing insights…');
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.value, '12m');
  assert.equal(tree.props['data-insights-metric'], 'saved');
  assert.equal(accessibleText(headline(tree)), '5current page saves');
  const projects = nodes(tree).find(node => node.props['aria-label'] === 'Top projects');
  nodes(projects).find(node => node.type === 'li').props.children.props.onClick();
  assert.equal(fixture.navigations.at(-1), '/insights?project=a&period=12m');
  fixture.queryState.refreshing = false;
  tree = fixture.render();
  assert.equal(fixture.pull().busy, false);
  assert.equal(tree.props['aria-busy'], undefined);
  assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), '');
  assert.deepEqual(fixture.refreshCounts, { reads: 1, covers: 1, saves: 1 });
});

test('every pending reads, artwork or audience query fences the mobile pull refresh', () => {
  for (const key of ['loading', 'refreshing', 'coverLoading', 'coverRefreshing', 'savesLoading', 'savesRefreshing']) {
    const fixture = load(rows, { presentation: 'mobile', ...(key.startsWith('saves') ? {} : { [key]: true }) });
    const saves = { data: { creatorSaves: 9, projectSaves: 7, followers: 3 }, loading: key === 'savesLoading', refreshing: key === 'savesRefreshing', retry() {} };
    const tree = fixture.render(saves);
    assert.equal(fixture.pull().busy, true, `${key} must fence another pull`);
    assert.equal(tree.props['aria-busy'], true);
    assert.equal(metricButtons(tree).length, key === 'loading' ? 0 : 3);
    assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), key === 'loading' || key === 'savesLoading' ? '' : 'Refreshing insights…');
    assert.equal(nodes(tree).some(node => node.type === 'button' && text(node) === 'Refresh'), false);
  }
});

test('mobile initial reads loading and errors retain the period picker without presenting fabricated metrics', () => {
  for (const state of [{ loading: true }, { error: 'Reads unavailable' }]) {
    const fixture = load(undefined, { presentation: 'mobile', ...state });
    let tree = fixture.render();
    const picker = nodes(tree).find(node => node.props['aria-label'] === 'Insights period');
    assert.equal(picker.type, 'select');
    assert.equal(nodes(tree).filter(node => node.props['aria-label'] === 'Insights period').length, 1);
    const fallbackCard = nodes(tree).find(node => hasClass(node, 'insights-data-surface') && nodes(node).some(child => child.props['aria-label'] === 'Insights period'));
    assert.ok(fallbackCard, 'Initial loading and errors keep the period control in their own raised card');
    assert.ok(nodes(fallbackCard).some(node => node.type === (state.loading ? 'loading' : 'error')), 'The real loading/error view stays with its period control');
    assert.equal(metricButtons(fallbackCard).length, 0);
    assert.equal(nodes(tree).some(node => node.type === 'h2' && text(node) === 'Project activity'), false);
    assert.equal(metricButtons(tree).length, 0);
    assert.equal(headline(tree), undefined);
    assert.equal(nodes(tree).some(node => node.props['aria-label'] === 'Metric totals'), false);
    assert.equal(nodes(tree).some(node => node.type === 'button' && text(node) === 'Refresh'), false);
    const view = nodes(tree).find(node => node.type === (state.loading ? 'loading' : 'error'));
    assert.ok(view);
    if (state.error) {
      assert.equal(view.props.description, state.error);
      assert.equal(fixture.pull().busy, false, 'a failed query is no longer an in-flight refresh');
      assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), '');
      view.props.onRetry();
      assert.deepEqual(fixture.refreshCounts, { reads: 1, covers: 0, saves: 0 });
    }
    picker.props.onChange({ target: { value: '30d' } });
    tree = fixture.render();
    assert.equal(nodes(tree).find(node => node.props['aria-label'] === 'Insights period').props.value, '30d');
    assert.equal(fixture.periods.at(-1), '30d', 'The fallback picker remains usable before read data is available');
    assert.equal(metricButtons(tree).length, 0);
    fixture.queryState.loading = false;
    fixture.queryState.error = undefined;
    tree = fixture.render();
    assert.equal(metricButtons(tree).length, 3);
    assert.match(text(tree), /No project reads yet/);
    assert.deepEqual(totals(tree), ['0', '0', '0']);
    assert.equal(text(nodes(tree).find(node => node.props.role === 'status')), '');
    assert.ok(activitySection(tree));
    assert.equal(metricButtons(activityCard(tree)).length, 3);
    assert.equal(nodes(activityCard(tree)).find(node => node.props['aria-label'] === 'Insights period').props.value, '30d');
  }
});
