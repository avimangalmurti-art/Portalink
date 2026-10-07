import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join('') : '';
function load(rows, { error, loading = false } = {}) {
  const states = ['7d', 'opened', false]; let cursor = 0, queryCursor = 0, refreshes = 0; const periods = [];
  const navigations = [];
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/library/MobileInsights.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return { ...React, useCallback: fn => fn, useState: () => { const index = cursor++; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; } };
    if (name === 'react-router-dom') return { useNavigate: () => path => navigations.push(path) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ reads: { list(period) { periods.push(period); return Promise.resolve(rows); } }, projects: { listProjects: async () => [] } }) };
    if (name.endsWith('/useAccountQuery')) return { useAccountQuery: query => { const index = queryCursor++; if(index===0) query(); return { data: index===0 ? rows : [{ id: 'b', cover: '/cover.jpg', coverAlt: 'B artwork' }], error: index===0 ? error : undefined, loading: index===0 && loading, retry: () => refreshes++ }; } };
    if (name.endsWith('/readSignal')) return { READ_PERIODS: [{key:'today',label:'Today'},{key:'7d',label:'7 days'},{key:'30d',label:'30 days'},{key:'12m',label:'12 months'},{key:'all',label:'All time'}] };
    if (name.endsWith('/ProjectCover')) return { ProjectCover: 'ProjectCover' };
    if (name.endsWith('/projectPresentation')) return { getProjectCoverPreview: () => undefined };
    if (name.endsWith('/worldOutline')) return { worldOutline: [] };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: 'icon' };
    if (name.endsWith('/StateViews')) return { LoadingState: 'loading', ErrorState: 'error' };
    if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => key });
    throw new Error(name);
  } });
  return { render(saves = { data: { creatorSaves: 9, projectSaves: 7, followers: 3 }, loading: false, retry() {} }) { cursor = queryCursor = 0; return exports.MobileInsights({ saves }); }, navigations, periods, refreshes: () => refreshes };
}
const rows = [
  { projectId: 'a', title: 'A', opened: 2, finished: 1, saved: 4, refs: { messages: 2 } },
  { projectId: 'b', title: 'B', opened: 9, finished: 7, saved: 1, refs: { linkedin: 8, 'own-link': 1 } },
  { projectId: 'c', title: 'C', opened: 0, finished: 0, saved: 0, refs: {} },
  { projectId: 'd', title: 'D', opened: 1, finished: 0, saved: 0, refs: { other: 1 } },
];
test('mobile insights ranks actual reads, switches metrics, expands projects and retains drill-down', () => {
  const fixture = load(rows);
  let tree = fixture.render();
  assert.match(text(tree), /12 project opens · 7 days/);
  const top = nodes(tree).find(node => node.props['aria-label'] === 'Top projects');
  assert.deepEqual(nodes(top).filter(node => node.type === 'strong').map(text), ['B', 'A', 'D']);
  nodes(top).find(node => node.type === 'li').props.children.props.onClick();
  assert.equal(fixture.navigations[0], '/insights?project=b&period=7d');
  nodes(top).find(node => node.props['aria-expanded'] === false).props.onClick();
  tree = fixture.render();
  assert.equal(nodes(nodes(tree).find(node => node.props['aria-label'] === 'Top projects')).filter(node => node.type === 'li').length, 4);
  const metricButtons = nodes(tree).filter(node => node.type === 'button' && 'aria-pressed' in node.props);
  metricButtons[1].props.onClick();
  assert.match(text(fixture.render()), /8 completed reads · 7 days/);
  metricButtons[2].props.onClick();
  tree = fixture.render();
  assert.match(text(tree), /5 current page saves/);
  assert.match(text(tree), /not saves made during this period/);
  assert.match(text(tree), /Reader and saver identities remain private/);
  assert.match(text(tree), /Location insights are not available/);
  nodes(tree).find(node => node.type === 'button' && text(node) === 'Refresh').props.onClick();
  assert.equal(fixture.refreshes(), 2);
});
test('loading and failures do not fabricate zero read metrics; genuine empty data is explained', () => {
  for (const state of [{ loading: true }, { error: 'Unavailable' }]) {
    const tree = load(undefined, state).render();
    assert.equal(nodes(tree).some(node => node.props.className === 'mobile-insights-headline'), false);
    assert.equal(nodes(tree).some(node => node.type === (state.loading ? 'loading' : 'error')), true);
  }
  assert.match(text(load([]).render()), /No project reads yet/);
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
  tree = load([{...rows[0], refs:{messages:2, linkedin:0}}]).render();
  const sources = nodes(tree).find(node => node.props['aria-label'] === 'Traffic sources');
  assert.equal(nodes(sources).filter(node => node.type === 'li').length, 1);
  assert.equal(nodes(sources).some(node => node.type === 'a' || node.type === 'button' || node.props.onClick), false);
  assert.equal(nodes(load([{...rows[0], refs:{}}]).render()).some(node => node.props['aria-label'] === 'Traffic sources'), false);
});
