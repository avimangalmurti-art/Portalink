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

function pageHarness({ savedRoute = false, initialSearch = '', preference = 'categories', headerHost, hideBack = false, citations = [] } = {}) {
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
    '../../presentation/usePresentation': {usePresentation:()=>headerHost?'mobile':'web'},
    './StudioEmptyState': {StudioEmptyState:'studio-empty'},
    '../references/useReferences':{useReferences:()=>({externalReferences:async()=>[]})},
    '../references/ExportSheet':{ExportSheet:'export-sheet'},
    '../sharing/InternalContentShare': {useInternalContentShare:()=>()=>{throw Error('Unexpected share in bookmarks selection fixture');}},
    '../citations/service': {listCitations:async()=>citations,resolveCitationItem:async()=>null,resolvePageId:async()=>null,resolveImageId:async()=>null,citationProject:async()=>null},
    '../citations/CiteSheet': {CiteSheet:'cite-sheet'},
    '../../components/text/textFormatting': {plainFormattedText:s=>s},
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} },
    '../../presentation/mobile/contextActions': load('../src/presentation/mobile/contextActions.ts', () => new Proxy({}, {get: (_o,key)=>key})),
    react,
    'react-dom': { createPortal: (children, host) => React.createElement('header-portal', { host }, children) },
    'react-router-dom': { useNavigate: () => (path, options) => { history.push({ path, options: { ...options } }); }, useSearchParams: () => [params, (next, options) => { params = new URLSearchParams(next); history.push({ params: String(params), options: { ...options } }); dirty = true; }] },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '../../app/routes': { buildPath },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'a' }, viewerProfileId: 'me', isAuthenticated: true }) },
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
  const { StudioPage } = load('../src/features/studio/StudioBookmarksList.tsx', name => { assert.ok(name in deps, name); return deps[name]; }, { requestAnimationFrame: callback => frames.push(callback), window: { location: { origin: 'https://portalink.test' } }, navigator: {}, document: { querySelector: () => null, activeElement: null }, HTMLElement: class {} });
  function render() { let renders = 0; while (dirty) { assert.ok(++renders < 20, 'render settles'); cursor = 0; dirty = false; effects = []; tree = StudioPage({ headerHost, hideBack, savedRoute, onBack: () => calls.push(['back']), onOpenProject: id => calls.push(['open', id]) }); effects.forEach(effect => effect()); } return tree; }
  return { get nodes() { return nodes(render()); }, history, calls, frames, data,
    button(label) { return this.nodes.find(node => node.type === 'button' && node.props['aria-label'] === label); },
    setSearch(value) { params = new URLSearchParams(value); dirty = true; },
    rerender() { dirty = true; return render(); },
  };
}

test('selection shows its toolbar, unsaves only bookmarks, then exits', async () => {
  const page = pageHarness({ initialSearch: 'category=bookmarks' });
  page.button('Select items').props.onClick();
  assert.equal(page.nodes.find(node => node.props['data-mobile-studio'] === '').props['data-studio-selecting'], 'true');
  assert.equal(page.nodes.some(node => node.props.className === 'studio-compose'), false);
  page.nodes.find(node => node.type === 'studio-row').props.onSelect();
  const toolbar = page.nodes.find(node => node.props['aria-label'] === 'Selected item actions');
  const unsave = nodes(toolbar).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'span' && child.props.children?.[0] === 'Remove bookmarks ('));
  assert.ok(unsave);
  unsave.props.onClick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(page.calls, [['unsave', 'saved-project:p1']]);
  assert.equal(page.nodes.find(node => node.props['data-mobile-studio'] === '').props['data-studio-selecting'], 'false');
  assert.equal(page.button('Select items').props.disabled, true);
  assert.equal(page.nodes.some(node => node.props.className === 'studio-selection-toolbar'), false);
});

test('retained bookmark list exposes Open and Unsave without inventory categories', () => {
 const page=pageHarness(); const entries=page.nodes.filter(node=>node.type==='studio-row');
 assert.deepEqual(entries.map(node=>node.props.id),['saved-project:p1']);
 assert.deepEqual(Array.from(entries[0].props.actions,action=>action.id),['open','unsave']);
 assert.equal(entries[0].props.primaryAction.id,'open');
 assert.equal(page.nodes.some(node=>node.props.className==='studio-category'),false);
});
test('Published rows suppress the zero-reference pill and retain project Export in their actions',async()=>{
 const page=pageHarness({initialSearch:'collection=published'});page.nodes;
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(page.nodes.some(node=>node.type==='button'&&String(node.props.children).includes('0 references')),false);
 const row=page.nodes.find(node=>node.type==='studio-row');assert.ok(row);
 row.props.onMenu();const sheet=page.nodes.find(node=>node.type==='sheet');assert.ok(sheet.props.actions.some(action=>action.id==='export'));
});
test('made-on calendar dates retain their day/year while other Studio date formatting stays unchanged',()=>{
 assert.equal(view.studioMadeOnDate('2024-06-15'),new Date(2024,5,15,12).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}));
 assert.equal(view.studioMadeOnDate('not-a-date'),undefined);
 assert.equal(view.studioDate('2026-06-15T12:00:00Z'),new Date('2026-06-15T12:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}));
});
test('share links use public canonical destinations and retain exact saved-page target', () => {
  assert.equal(view.studioSharePath(rows[0]), '/share/me/c/c1/p1');
  assert.equal(view.studioSharePath(rows[2]), null);
  assert.equal(view.studioSharePath({ kind: 'saved-page', target: { attachmentId: 'a2' }, presentation: { pageNumber: 7, view: { project, creator: { id: 'me' } } } }), '/share/me/c/c1/p1?media=a2&page=7');
  assert.equal(view.studioDate('not-a-date'), undefined);
});


test('mobile selection and Back render in the header host and retain selection behavior', () => {
 const host = {};
 const page = pageHarness({ initialSearch: 'category=bookmarks', headerHost: host });
 const portal = page.nodes.find(node => node.type === 'header-portal');
 assert.equal(portal.props.host, host);
 assert.ok(nodes(portal).some(node => node.props['aria-label'] === 'Back from Bookmarks'));
 assert.ok(nodes(portal).some(node => node.props['aria-label'] === 'Select items'));
 assert.equal(page.nodes.filter(node => node.props.className === 'studio-bookmarks-navigation').length, 1);
 page.button('Select items').props.onClick();
 assert.ok(page.button('Exit selection'));
 page.button('Back from Bookmarks').props.onClick();
 assert.ok(page.button('Select items'));
 assert.deepEqual(page.calls, []);
 page.button('Back from Bookmarks').props.onClick();
 assert.deepEqual(page.calls, [['back']]);
});

test('collection selection wins over a stale legacy category and drives actual rows', () => {
 for (const category of ['published', 'activity', 'all']) {
  const selected = view.readStudioLocation(new URLSearchParams('collection='+category+'&category=bookmarks'));
  assert.equal(selected.category, category);
  const page = pageHarness({ initialSearch: 'collection='+category+'&category=bookmarks' });
  const entries = page.nodes.filter(node => node.type === 'studio-row').map(node => node.props.id);
  assert.equal(page.nodes.find(node => node.props.className === 'studio-title').props.children, category[0].toUpperCase()+category.slice(1));
  assert.deepEqual(entries, category === 'published' ? ['published:p1'] : category === 'activity' ? ['activity:n1'] : ['published:p1','saved-project:p1','activity:n1']);
 }
 assert.equal(view.readStudioLocation(new URLSearchParams('category=published')).category, 'published');
 assert.equal(view.readStudioLocation(new URLSearchParams('collection=published'), true).category, 'bookmarks');
});

test('switching collections updates heading, rows and selection together', () => {
 const page = pageHarness({ initialSearch: 'collection=bookmarks' });
 page.button('Select items').props.onClick();
 assert.ok(page.button('Exit selection'));
 page.setSearch('collection=published');
 assert.equal(page.nodes.find(node => node.props.className === 'studio-title').props.children, 'Published');
 assert.deepEqual(page.nodes.filter(node => node.type === 'studio-row').map(node => node.props.id), ['published:p1']);
 assert.ok(page.button('Select items'));
 assert.ok(page.button('Back from Published'));
 page.setSearch('collection=activity');
 assert.equal(page.nodes.find(node => node.props.className === 'studio-title').props.children, 'Activity');
 assert.deepEqual(page.nodes.filter(node => node.type === 'studio-row').map(node => node.props.id), ['activity:n1']);
});

test('mobile Studio retains Back, Select and Done together in the header', () => {
 const page = pageHarness({ initialSearch:'collection=published', headerHost:{}, hideBack:true });
 assert.equal(page.nodes.some(node => node.props.className === 'studio-bookmarks-back'), true);
 page.button('Select items').props.onClick();
 assert.ok(page.button('Exit selection'));
 page.button('Exit selection').props.onClick();
 assert.ok(page.button('Select items'));
});

test('Published references live within row metadata, hide zero, and keep the reference link', async()=>{
 for(const count of [0,2]){const page=pageHarness({initialSearch:'collection=published',citations:Array.from({length:count},()=>({citing_project_id:'p1'}))});page.nodes;for(let i=0;i<10;i++)await Promise.resolve();const row=page.nodes.find(n=>n.type==='studio-row');assert.equal(row.props.referenceCount,count);assert.equal(page.nodes.some(n=>n.type==='li'&&nodes(n).some(c=>c.props.children===`${count} references`)),false);row.props.onOpenReferences();assert.equal(page.history.at(-1).path,'/p/me/c/c1/p1#references');}
});
