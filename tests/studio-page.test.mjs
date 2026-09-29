import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const buildPath = (kind, params = {}) => kind === 'studio' ? '/studio' : kind === 'sharedProfile' ? `/share/${params.profileId}` : kind === 'sharedProject' ? `/share/${params.profileId}/c/${params.categoryId}/${params.projectId}` : '/portalink';
function load(file, requireModule, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: requireModule, URLSearchParams, URL, ...globals });
  return exports;
}
const model = load('../src/features/studio/studioModel.ts', name => name.endsWith('/routes') ? { buildPath } : { savedPageKey: target => target.attachmentId });
const view = load('../src/features/studio/studioView.ts', () => ({ buildPath }));
const project = { id: 'p1', categoryId: 'c1', title: 'First project', summary: 'A drawing', cover: '', coverAlt: '', publishedAt: '2026-09-01' };
const rows = [
  { kind: 'published', id: 'published:p1', title: project.title, secondary: project.summary, href: '/p/me/c/c1/p1', project, creator: { id: 'me' } },
  { kind: 'saved-project', id: 'saved-project:p1', title: 'Saved project', secondary: 'Creator', href: '/p/me/c/c1/p1', project, creator: { id: 'me' } },
  { kind: 'activity', id: 'activity:n1', title: 'Message', secondary: 'Hello', href: '/messages?conversation=1', notification: { id: 'n1', isUnread: true } },
];

function pageHarness({ savedRoute = false, initialSearch = '', preference = 'categories' } = {}) {
  let params = new URLSearchParams(initialSearch), cursor = 0, dirty = true, effects = [], tree;
  const slots = [], history = [], calls = [], frames = [];
  const currentRows = [...rows];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const management = { editor: { result: null, open: id => calls.push(['edit', id]) } };
  const data = { status: 'ready', error: null, refresh() {}, updatedAt: 10, hasMore: false, loadingMore: false, loadMoreError: null, pendingIds: new Set(), mutationError: null,
    async unsave(row) { calls.push(['unsave', row.id]); currentRows.splice(currentRows.findIndex(item => item.id === row.id), 1); dirty = true; return true; },
    async markRead(row) { calls.push(['mark-read', row.id]); row.notification.isUnread = false; dirty = true; return true; },
  };
  const deps = {
    react,
    'react-router-dom': { useNavigate: () => (path, options) => { history.push({ path, options: { ...options } }); }, useSearchParams: () => [params, (next, options) => { params = new URLSearchParams(next); history.push({ params: String(params), options: { ...options } }); dirty = true; }] },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '../../app/routes': { buildPath },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'a' }, viewerProfileId: 'me' }) },
    '../../components/media/ProjectCover': { ProjectCover: 'project-cover' },
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
    '../../utils/copyPublicLink': { copyPublicLink: async value => calls.push(['copy', value]) },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/StateViews': { EmptyState: 'empty', ErrorState: 'error', LoadingState: 'loading' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'back' },
    '../../utils/appearancePreferences': { readStudioView: () => preference, writeStudioView: value => calls.push(['preference', value]) },
    '../projects/ProjectEditorDialog': { ProjectEditorDialog: 'editor' },
    '../projects/useProjectManagement': { useProjectManagement: () => management },
    './StudioRow': { StudioRow: 'studio-row' }, './StudioActionSheet': { StudioActionSheet: 'sheet' }, './studioModel': model, './studioView': view,
    './useStudioData': { useStudioData: (category, tab) => { const sections = model.studioSections(currentRows, category, tab); return { ...data, sections, rows: sections.flatMap(section => section.rows) }; } },
  };
  const { StudioPage } = load('../src/features/studio/StudioPage.tsx', name => { assert.ok(name in deps, name); return deps[name]; }, { requestAnimationFrame: callback => frames.push(callback), window: { location: { origin: 'https://portalink.test' } }, navigator: {}, document: { querySelector: () => null, activeElement: null }, HTMLElement: class {} });
  function render() { let renders = 0; while (dirty) { assert.ok(++renders < 20, 'render settles'); cursor = 0; dirty = false; effects = []; tree = StudioPage({ savedRoute, onBack: () => calls.push(['back']), onOpenProject: id => calls.push(['open', id]), onCreateProject: () => calls.push(['compose']) }); effects.forEach(effect => effect()); } return tree; }
  return { get nodes() { return nodes(render()); }, history, calls, frames, data,
    button(label) { return this.nodes.find(node => node.type === 'button' && node.props['aria-label'] === label); },
    setSearch(value) { params = new URLSearchParams(value); dirty = true; },
    rerender() { dirty = true; return render(); },
  };
}

test('category pills replace URL selection and only the active label expands', () => {
  const page = pageHarness();
  const pills = page.nodes.filter(node => node.props.className === 'studio-category');
  assert.deepEqual(pills.map(node => node.props['aria-label']), ['Drafts', 'Published', 'Bookmarks', 'Activity', 'All']);
  assert.equal(pills.filter(node => node.props['aria-pressed']).length, 1);
  page.button('Published').props.onClick();
  assert.deepEqual(page.history[0], { params: 'category=published', options: { replace: true } });
  assert.equal(page.button('Published').props['aria-pressed'], true);
  assert.equal(page.nodes.filter(node => node.type === 'studio-row').length, 1);
});

test('/saved preserves creator-tab deep links and category changes replace into Studio', () => {
  const page = pageHarness({ savedRoute: true, initialSearch: 'tab=creators', preference: 'list' });
  assert.equal(page.button('Bookmarks').props['aria-pressed'], true);
  const segment = page.nodes.find(node => node.type === 'button' && node.props.children === 'Creators');
  assert.equal(segment.props['aria-pressed'], true);
  page.button('Activity').props.onClick();
  assert.deepEqual(page.history[0], { path: '/studio?category=activity', options: { replace: true } });
});

test('a later explicit category URL overrides List View without a remount', () => {
  const page = pageHarness({ preference: 'list' });
  assert.equal(page.nodes.some(node => node.props['aria-label'] === 'Studio categories'), false);
  page.setSearch('category=published');
  assert.equal(page.button('Published').props['aria-pressed'], true);
});

test('selection swaps compose for toolbar, unsaves only bookmarks, then exits', async () => {
  const page = pageHarness({ initialSearch: 'category=bookmarks' });
  page.button('Select items').props.onClick();
  assert.equal(page.nodes.find(node => node.props['data-mobile-studio'] === '').props['data-studio-selecting'], 'true');
  assert.equal(page.nodes.some(node => node.props.className === 'studio-compose'), false);
  page.nodes.find(node => node.type === 'studio-row').props.onSelect();
  const toolbar = page.nodes.find(node => node.props['aria-label'] === 'Selected item actions');
  const unsave = nodes(toolbar).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'span' && child.props.children?.[0] === 'Unsave ('));
  assert.ok(unsave);
  unsave.props.onClick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(page.calls, [['unsave', 'saved-project:p1']]);
  assert.equal(page.nodes.find(node => node.props['data-mobile-studio'] === '').props['data-studio-selecting'], 'false');
  assert.equal(page.button('Select items').props.disabled, true);
  assert.equal(page.nodes.some(node => node.props.className === 'studio-compose'), true);
});

test('swipe mapping exposes only existing actions and uses Open as full-swipe primary', () => {
  const page = pageHarness();
  const entries = page.nodes.filter(node => node.type === 'studio-row');
  const published = entries.find(node => node.props.id.startsWith('published:'));
  const bookmark = entries.find(node => node.props.id.startsWith('saved-project:'));
  const activity = entries.find(node => node.props.id.startsWith('activity:'));
  assert.deepEqual(Array.from(published.props.actions, action => action.id), ['share', 'edit']);
  assert.deepEqual(Array.from(bookmark.props.actions, action => action.id), ['open', 'unsave']);
  assert.deepEqual(Array.from(activity.props.actions, action => action.id), ['open', 'mark-read']);
  assert.ok(entries.every(node => node.props.primaryAction.id === 'open'));
  published.props.actions.find(action => action.id === 'edit').onAction();
  assert.deepEqual(page.calls, [['edit', 'p1']]);
});

test('share links use public canonical destinations and retain exact saved-page target', () => {
  assert.equal(view.studioSharePath(rows[0]), '/share/me/c/c1/p1');
  assert.equal(view.studioSharePath(rows[2]), null);
  assert.equal(view.studioSharePath({ kind: 'saved-page', target: { attachmentId: 'a2' }, presentation: { pageNumber: 7, view: { project, creator: { id: 'me' } } } }), '/share/me/c/c1/p1?media=a2&page=7');
  assert.equal(view.studioDate('not-a-date'), undefined);
});
