import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const summary = {
  projectId: 'work', profileId: 'owner', categoryId: 'portal', title: 'Study', pageCount: 2,
  opened: 5, finished: 2, saved: 1, reach: [5, 2], savedByPage: [0, 1], refs: {},
  pages: [{ page: 0, attachmentId: 'file', pageIndex: 0 }, { page: 1, attachmentId: 'file', pageIndex: 1 }],
};

// Model browser history, rather than treating every navigation as a new entry.
// The components below are real; only their service hooks and router boundary
// are controlled. Physical/browser behavior is verified separately.
function fixture({ presentation = 'mobile', entries = ['/studio?collection=activity'] } = {}) {
  const stack = entries.map(entry => typeof entry === 'string' ? { path: entry, state: null } : entry);
  const writes = [];
  let index = stack.length - 1;
  const current = () => new URL(stack[index].path, 'https://portalink.test');
  const navigate = (to, options) => {
    writes.push({ to, options });
    if (typeof to === 'number') { index = Math.max(0, Math.min(stack.length - 1, index + to)); return; }
    const entry = { path: to, state: options?.state ?? null };
    if (options?.replace) stack[index] = entry;
    else { stack.splice(index + 1); stack.push(entry); index++; }
  };
  const window = { history: { get state() { return { idx: index }; } } };
  const router = {
    Link: 'link', useNavigate: () => navigate,
    useLocation: () => ({ pathname: current().pathname, search: current().search, hash: current().hash, state: stack[index].state }),
    useSearchParams: () => [new URLSearchParams(current().search), (next, options) => {
      const query = new URLSearchParams(next).toString();
      navigate(current().pathname + (query ? `?${query}` : ''), options);
    }],
  };
  const react = { ...React, useCallback: callback => callback };
  const services = { creatorSaves: { getSaveInsights: async () => ({}) }, reads: { summary: async () => summary } };
  const { InsightsPage } = sourceModule('src/features/library/PersonalPages.tsx', {
    react, 'react-router-dom': router, 'lucide-react': {},
    '../../presentation/mobile/MobileProfileContext': { MobileProfileContext: 'profile-context' },
    '../../presentation/mobile/MobileContextActions': { MobileContextButton: 'actions' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../app/routes': { buildPath: () => '/studio' }, '../../contexts/AuthContext': { useAuth: () => ({}) },
    '../../contexts/ServicesContext': { useServices: () => services },
    '../../components/profile/ActivityCollectionPage': {}, '../../components/profile/CreatorAvatar': {},
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/StateViews': { LoadingState: 'loading', ErrorState: 'error', EmptyState: 'empty' },
    '../../components/messages/InboxPanel': {}, './useAccountQuery': { useAccountQuery: () => ({ loading: false, data: {}, retry() {} }) },
    './SavedPagesCollection': {}, './collectionQueries': {},
  }, { window });
  const { ReadsProject } = sourceModule('src/features/reads/ReadsView.tsx', {
    react, 'react-router-dom': router, '../../contexts/ServicesContext': { useServices: () => services },
    '../library/useAccountQuery': { useAccountQuery: (_load, options) => options?.key ? { loading: false, data: summary } : { loading: true } },
    './readSignal': { READ_PERIODS: [{ key: '7d', label: '7 days' }, { key: '30d', label: '30 days' }],
      dropSentence: () => '', bucketReach: () => [{ start: 0, end: 0, detailPage: 0, count: 5 }, { start: 1, end: 1, detailPage: 1, count: 2 }] },
    '../../components/media/PdfPage': { PdfPage: 'pdf' }, '../../components/ui/Button': { Button: 'button-component' },
    './reads.css': {}, '../../presentation/usePresentation': { usePresentation: () => presentation },
  }, { window });
  const header = () => {
    const tree = InsightsPage({ onBack: () => navigate(-1) });
    const wrapper = nodes(tree).find(node => typeof node.type === 'function' && node.type.name === 'PersonalHeader');
    return nodes(wrapper.type(wrapper.props)).find(node => node.props['aria-label'] === 'Go back');
  };
  return {
    stack, writes, navigate, header,
    get path() { return stack[index].path; }, get entry() { return stack[index]; }, get index() { return index; },
    headerBack() { header().props.onClick(); },
    inspectPage(via = 'bar') {
      const content = nodes(ReadsProject({ projectId: 'work' }));
      if (via === 'picker') content.find(node => node.type === 'select').props.onChange({ target: { value: '1' } });
      else content.find(node => node.props['aria-label'] === 'Page 2: 2 reached').props.onClick();
    },
    detailBack() {
      const detail = ReadsProject({ projectId: 'work' });
      assert.equal(detail.type.name, 'ReadPageDetail');
      nodes(detail.type(detail.props)).find(node => node.type === 'button-component' && node.props.children === 'Back to Reads').props.onClick();
    },
  };
}

test('Back from a read notification returns to the exact Studio Activity entry without an Insights/Reads loop', () => {
  const activity = { path: '/studio?collection=activity&category=activity', state: { retainedActivity: 'original-state' } };
  const h = fixture({ entries: ['/p/owner', activity] });
  h.navigate('/insights?project=work');
  const length = h.stack.length;
  h.headerBack();
  assert.equal(h.entry, activity, 'Back must restore the actual Activity entry and its state');
  assert.equal(h.index, 1);
  assert.equal(h.stack.length, length, 'Back must not push a new Insights entry');
  h.navigate(-1);
  assert.equal(h.path, '/p/owner', 'Further native Back must leave Studio instead of reopening Reads');
  h.navigate(1); assert.equal(h.entry, activity);
  h.navigate(1); assert.equal(h.path, '/insights?project=work', 'Forward still owns the original read destination');
  h.headerBack(); assert.equal(h.entry, activity);
});

test('normal Insights drill-down Back restores its original overview and selected period', () => {
  const overview = { path: '/insights?period=30d', state: { overviewPosition: 260 } };
  const h = fixture({ entries: ['/studio', overview] });
  h.navigate('/insights?project=work&period=30d');
  h.headerBack();
  assert.equal(h.entry, overview);
  assert.equal(h.stack.length, 3);
  h.headerBack();
  assert.equal(h.path, '/studio');
});

test('page-detail Back pops to the original project Reads before notification Back returns to Activity', () => {
  for (const via of ['bar', 'picker']) {
    const h = fixture();
    const project = { path: '/insights?project=work&period=7d', state: { fromNotification: 'notification-5' } };
    h.navigate(project.path, { state: project.state });
    const original = h.entry;
    h.inspectPage(via);
    assert.match(h.path, /page=1/);
    assert.equal(h.entry.state.fromNotification, 'notification-5', 'Opening a page must preserve unrelated summary state');
    h.detailBack();
    assert.equal(h.entry, original, `${via}: Back to Reads must reuse the actual summary entry`);
    assert.equal(h.stack.length, 3);
    h.headerBack();
    assert.equal(h.path, '/studio?collection=activity');
    h.navigate(1); assert.equal(h.entry, original, 'The closed detail must not be added behind the summary');
  }
});

test('a page deep link with prior unrelated history returns to its summary instead of leaving Reads', () => {
  const h = fixture({ entries: ['/studio?collection=activity', '/insights?project=work&page=1&period=30d'] });
  h.detailBack();
  assert.equal(h.path, '/insights?project=work&period=30d');
  assert.equal(h.index, 1, 'Back to Reads is hierarchical when no real summary was recorded');
  assert.equal(h.stack.length, 2);
  assert.equal(h.writes.at(-1).options.replace, true);
  h.headerBack();
  assert.equal(h.path, '/studio?collection=activity');
});

test('multiple page entries return to the recorded summary rather than another page detail', () => {
  const h = fixture({ entries: ['/p/owner', '/insights?project=work&period=30d'] });
  const original = h.entry;
  h.inspectPage('picker');
  // Another page address can share the summary return context. Back to Reads
  // must close the whole page inspection, not just go to the previous page.
  h.navigate('/insights?project=work&page=0&period=30d', { state: h.entry.state });
  assert.equal(h.index, 3);
  h.detailBack();
  assert.equal(h.entry, original);
  assert.equal(h.writes.at(-1).to, -2);
  assert.equal(h.stack.length, 4);
});

test('invalid or mismatched summary return contexts use a safe in-app replacement', () => {
  for (const origin of [
    undefined, null, { projectId: 'other', period: '30d', index: 0 },
    { projectId: 'work', period: '7d', index: 0 },
    ...[-1, 1, 2, .5, '0', null].map(index => ({ projectId: 'work', period: '30d', index })),
  ]) {
    const h = fixture({ entries: ['/p/owner', { path: '/insights?project=work&page=1&period=30d', state: { readsSummaryReturn: origin } }] });
    h.detailBack();
    assert.equal(h.path, '/insights?project=work&period=30d');
    assert.equal(h.index, 1);
    assert.equal(h.stack.length, 2);
    assert.equal(h.writes.at(-1).options.replace, true);
  }
});

test('direct MOBILE read and page URLs stay in the app and replace their hierarchical fallback', () => {
  for (const query of ['project=work', 'project=work&page=1&period=30d']) {
    const h = fixture({ entries: [`/insights?${query}`] });
    if (query.includes('page=')) {
      h.detailBack();
      assert.equal(h.path, '/insights?project=work&period=30d');
      assert.equal(h.stack.length, 1);
      assert.equal(h.writes.at(-1).options.replace, true);
    }
    h.headerBack();
    assert.equal(h.path, '/insights');
    assert.equal(h.stack.length, 1);
    assert.equal(h.index, 0);
    assert.equal(h.writes.at(-1).options.replace, true);
  }
});

test('WEB retains its existing hierarchical Reads and page-detail Back behavior', () => {
  for (const via of ['bar', 'picker']) {
    const h = fixture({ presentation: 'web', entries: ['/studio', { path: '/insights?project=work&period=30d', state: { existingState: 'web' } }] });
    h.inspectPage(via);
    assert.equal(h.writes.at(-1).options, undefined, 'WEB page navigation must not add mobile summary history context');
    h.detailBack();
    assert.equal(h.path, '/insights?project=work&period=30d');
    assert.equal(h.stack.length, 4);
    assert.notEqual(h.writes.at(-1).options?.replace, true);
    h.headerBack();
    assert.equal(h.path, '/insights');
    assert.equal(h.stack.length, 5);
    assert.notEqual(h.writes.at(-1).options?.replace, true);
  }
});
