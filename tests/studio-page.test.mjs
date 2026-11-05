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

function pageHarness({ savedRoute = false, initialSearch = '', preference = 'categories', headerHost, presentation = headerHost ? 'mobile' : 'web', hideBack = false, citations = [], extraRows = [], initialRows = rows, deleteActivity = async targets => targets.map(row => row.id) } = {}) {
  let params = new URLSearchParams(initialSearch), cursor = 0, dirty = true, effects = [], tree;
  const slots = [], history = [], calls = [], frames = [], citationReads = [];
  const references = { externalReferences: async () => [] };
  const currentRows = [...initialRows, ...extraRows].map(row => row.kind === 'activity' ? { ...row, notification: { ...row.notification } } : row);
  const auth = { user: { id: 'a' }, viewerProfileId: 'me', isAuthenticated: true };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); }); } },
    useLayoutEffect(effect, deps) { return react.useEffect(effect, deps); },
  };
  const management = { editor: { result: null, open: id => calls.push(['edit', id]) } };
  const data = { status: 'ready', error: null, refresh() {}, updatedAt: 10, hasMore: false, loadingMore: false, loadMoreError: null, pendingIds: new Set(), mutationError: null, activityRefreshing: false,
    async unsave(row) { calls.push(['unsave', row.id]); currentRows.splice(currentRows.findIndex(item => item.id === row.id), 1); dirty = true; return true; },
    async markRead(row) { calls.push(['mark-read', row.id]); row.notification.isUnread = false; dirty = true; return true; },
    async deleteActivity(targets) {
      calls.push(['delete', Array.from(targets, row => row.id)]);
      const identity = auth.user?.id;
      const confirmed = await deleteActivity(targets);
      if (auth.user?.id !== identity) return [];
      for (let index = currentRows.length - 1; index >= 0; index--) {
        if (currentRows[index].kind === 'activity' && confirmed.includes(currentRows[index].id)) currentRows.splice(index, 1);
      }
      dirty = true;
      return confirmed;
    },
  };
  const deps = {
    '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    '../../presentation/usePresentation': {usePresentation:()=>presentation},
    './StudioEmptyState': {StudioEmptyState:'studio-empty'},
    '../references/useReferences':{useReferences:()=>references},
    '../references/ExportSheet':{ExportSheet:'export-sheet'},
    '../sharing/InternalContentShare': {useInternalContentShare:()=>target=>calls.push(['share',target])},
    '../citations/service': {listCitations:async filter=>{citationReads.push(filter);return citations;},resolveCitationItem:async()=>null,resolvePageId:async()=>null,resolveImageId:async()=>null,citationProject:async()=>null},
    '../citations/CiteSheet': {CiteSheet:'cite-sheet'},
    '../../components/text/textFormatting': {plainFormattedText:s=>s},
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} },
    '../../presentation/mobile/contextActions': load('../src/presentation/mobile/contextActions.ts', () => new Proxy({}, {get: (_o,key)=>key})),
    react,
    'react-dom': { createPortal: (children, host) => React.createElement('header-portal', { host }, children) },
    'react-router-dom': { useNavigate: () => (path, options) => { history.push({ path, options: { ...options } }); }, useSearchParams: () => [params, (next, options) => { params = new URLSearchParams(next); history.push({ params: String(params), options: { ...options } }); dirty = true; }] },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '../../app/routes': { buildPath },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../components/media/ProjectCover': { ProjectCover: 'project-cover' },
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
    '../../utils/copyPublicLink': { copyPublicLink: async value => calls.push(['copy', value]) },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/StateViews': { EmptyState: 'empty', ErrorState: 'error', LoadingState: 'loading' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'back', useMobileScreenActive: () => true },
    '../../utils/appearancePreferences': { readStudioView: () => preference, writeStudioView: value => calls.push(['preference', value]) },
    '../projects/ProjectEditorDialog': { ProjectEditorDialog: 'editor' },
    '../projects/useProjectManagement': { useProjectManagement: () => management },
    './StudioRow': { StudioRow: 'studio-row' }, './StudioActionSheet': { StudioActionSheet: 'sheet' }, './activityScrollAnchor': { useActivityScrollAnchor() {} }, './studioModel': model, './studioView': view,
    './useStudioData': { useStudioData: (category, tab) => { const sections = model.studioSections(currentRows, category, tab); return { ...data, sections, rows: sections.flatMap(section => section.rows) }; } },
  };
  const { StudioPage } = load('../src/features/studio/StudioBookmarksList.tsx', name => { assert.ok(name in deps, name); return deps[name]; }, { requestAnimationFrame: callback => frames.push(callback), window: { location: { origin: 'https://portalink.test' } }, navigator: {}, document: { querySelector: () => null, activeElement: null }, HTMLElement: class {} });
  function render() { let renders = 0; while (dirty) { assert.ok(++renders < 20, 'render settles'); cursor = 0; dirty = false; effects = []; tree = StudioPage({ headerHost, hideBack, savedRoute, onBack: () => calls.push(['back']), onOpenProject: id => calls.push(['open', id]) }); effects.forEach(effect => effect()); } return tree; }
  return { get nodes() { return nodes(render()); }, history, calls, frames, data, citationReads,
    button(label) { return this.nodes.find(node => node.type === 'button' && node.props['aria-label'] === label); },
    setSearch(value) { params = new URLSearchParams(value); dirty = true; },
    setAccount(id) { auth.user = id ? { id } : null; dirty = true; },
    rerender() { dirty = true; return render(); },
  };
}

test('desktop Studio loads citation labels only for rows that can display them', async () => {
  for (const initialSearch of ['category=activity', 'category=bookmarks&tab=projects', 'category=bookmarks&tab=creators']) {
    const page = pageHarness({ initialSearch });
    void page.nodes;
    assert.deepEqual(page.citationReads, []);
  }
  const empty = pageHarness({ initialSearch: 'category=published', initialRows: [] });
  void empty.nodes;
  assert.deepEqual(empty.citationReads, []);
  const published = pageHarness({ initialSearch: 'category=published', citations: [{ citing_project_id: 'p1' }] });
  void published.nodes;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(published.citationReads.length, 1);
  assert.equal(published.nodes.find(node => node.type === 'studio-row').props.referenceCount, 1);
  const mobile = pageHarness({ initialSearch: 'category=activity', presentation: 'mobile' });
  void mobile.nodes;
  assert.equal(mobile.citationReads.length, 1, 'The mobile collection retains its existing query path.');
});

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
  assert.equal(view.studioSharePath({ kind: 'saved-page', target: { attachmentId: 'a2' }, presentation: { pageNumber: 7, view: { project, creator: { id: 'me' } } } }), '/share/me/c/c1/p1?media=a2&page=7&view=page');
  assert.equal(view.studioDate('not-a-date'), undefined);
});


test('mobile search owns Select and selection-only Back without a duplicate header, while WEB keeps its portal', () => {
 const host = {};
 const page = pageHarness({ initialSearch: 'category=bookmarks', headerHost: host });
 assert.equal(page.nodes.some(node=>node.type==='header-portal'||node.type==='h1'||node.props['aria-label']==='Back from Bookmarks'||node.props['aria-label']==='Bookmarks options'),false);
 const toolbar=page.nodes.find(node=>node.props.className==='studio-inline-toolbar');
 assert.ok(nodes(toolbar).some(node=>node.type==='input'&&node.props['aria-label']==='Search Studio'));
 assert.ok(nodes(toolbar).some(node=>node.props['aria-label']==='Select items'));
 assert.equal(page.button('Back from selection'),undefined);
 page.button('Select items').props.onClick();
 assert.ok(page.button('Exit selection'));
 page.nodes.find(node=>node.type==='studio-row').props.onSelect();
 assert.equal(page.nodes.find(node=>node.type==='studio-row').props.selected,true);
 page.button('Back from selection').props.onClick();
 assert.ok(page.button('Select items'));
 assert.equal(page.button('Back from selection'),undefined);
 assert.equal(page.nodes.find(node=>node.type==='studio-row').props.selected,false);
 assert.deepEqual(page.calls, []);
 page.nodes.find(node=>node.type==='back').props.action();
 assert.deepEqual(page.calls, [['back']]);
 const web=pageHarness({initialSearch:'category=bookmarks',headerHost:host,presentation:'web'});
 const portal=web.nodes.find(node=>node.type==='header-portal');
 assert.equal(portal.props.host,host);
 assert.ok(nodes(portal).some(node=>node.props['aria-label']==='Back from Bookmarks'));
 assert.equal(web.nodes.filter(node=>node.type==='h1').length,1);
});

test('collection selection wins over a stale legacy category and drives actual rows', () => {
 for (const category of ['published', 'activity']) {
  const selected = view.readStudioLocation(new URLSearchParams('collection='+category+'&category=bookmarks'));
  assert.equal(selected.category, category);
  const page = pageHarness({ initialSearch: 'collection='+category+'&category=bookmarks' });
  const entries = page.nodes.filter(node => node.type === 'studio-row').map(node => node.props.id);
  assert.equal(page.nodes.find(node => node.props.className === 'studio-title').props.children, category[0].toUpperCase()+category.slice(1));
  assert.deepEqual(entries, category === 'published' ? ['published:p1'] : ['activity:n1']);
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

test('mobile delegated Back exits selection and Done returns to the stable local toolbar', () => {
 const page = pageHarness({ initialSearch:'collection=published', headerHost:{}, hideBack:true });
 assert.equal(page.nodes.some(node => node.props.className === 'studio-bookmarks-back'), false);
 page.button('Select items').props.onClick();
 assert.ok(page.button('Exit selection'));
 page.nodes.find(node=>node.type==='back').props.action();
 assert.ok(page.button('Select items'));
 assert.deepEqual(page.calls,[]);
 page.button('Select items').props.onClick();
 page.button('Exit selection').props.onClick();
 assert.ok(page.button('Select items'));
 assert.equal(page.button('Back from selection'),undefined);
});

test('Published references live within row metadata, hide zero, and keep the reference link', async()=>{
 for(const count of [0,2]){const page=pageHarness({initialSearch:'collection=published',citations:Array.from({length:count},()=>({citing_project_id:'p1'}))});page.nodes;for(let i=0;i<10;i++)await Promise.resolve();const row=page.nodes.find(n=>n.type==='studio-row');assert.equal(row.props.referenceCount,count);assert.equal(page.nodes.some(n=>n.type==='li'&&nodes(n).some(c=>c.props.children===`${count} references`)),false);row.props.onOpenReferences();assert.equal(page.history.at(-1).path,'/p/me/c/c1/p1#references');}
});

test('row copying and batch sharing emit official public links from a preview host', async () => {
 for (const headerHost of [undefined, {}]) {
  const page = pageHarness({ initialSearch: 'collection=published', headerHost, extraRows: [{ ...rows[0], id:'published:p2', project:{...project,id:'p2'} }] });
  page.nodes.find(node => node.type === 'studio-row' && node.props.id === 'published:p1').props.onMenu();
  page.nodes.find(node => node.type === 'sheet').props.actions.find(action => action.id === 'copy-link').onAction();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(page.calls.find(call => call[0] === 'copy'), ['copy', 'https://portalinknetworks.com/share/me/c/c1/p1']);
  page.button('Select items').props.onClick();
  page.nodes.filter(node => node.type === 'studio-row' && node.props.id !== 'activity:n1').forEach(node => node.props.onSelect());
  const toolbar = page.nodes.find(node => node.props['aria-label'] === 'Selected item actions');
  nodes(toolbar).find(node => node.type === 'button' && nodes(node).some(child => child.type === 'span' && child.props.children?.[0] === 'Share (')).props.onClick();
  assert.equal(page.calls.find(call => call[0] === 'share')[1].url, 'https://portalinknetworks.com/share/me/c/c1/p1\nhttps://portalinknetworks.com/share/me/c/c1/p2');
 }
});

const inboxRows = (count, isUnread = false) => Array.from({ length: count }, (_, index) => ({
  kind: 'activity', id: `activity:inbox-${index}`, title: `Update ${index}`, secondary: `Inbox detail ${index}`,
  notification: { id: `inbox-${index}`, isUnread },
}));
const selectAll = page => {
  page.button('Select items').props.onClick();
  page.nodes.find(node => node.type === 'button' && node.props.children === 'Select all shown').props.onClick();
};

test('read and unavailable-target Activity rows expose destructive single deletion on MOBILE and WEB', async () => {
  for (const presentation of ['mobile', 'web']) {
    const page = pageHarness({ initialSearch: 'collection=activity', presentation, initialRows: inboxRows(1) });
    const row = page.nodes.find(node => node.type === 'studio-row');
    assert.equal(row.props.onOpen, undefined);
    assert.deepEqual(Array.from(row.props.actions, action => action.id), ['delete']);
    assert.equal(row.props.actions[0].destructive, true);
    row.props.onMenu();
    const sheet = page.nodes.find(node => node.type === 'sheet');
    assert.deepEqual(Array.from(sheet.props.actions, action => [action.id, action.label, action.destructive]), [['delete', 'Delete update', true]]);
    sheet.props.actions[0].onAction();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(page.calls, [['delete', ['activity:inbox-0']]]);
    assert.equal(page.nodes.some(node => node.type === 'studio-row'), false);
    assert.ok(page.nodes.some(node => node.props.role === 'status' && node.props.children === '1 update deleted'));
  }
});

test('MOBILE all-read selection can delete70updates in one request and blocks duplicate taps', async () => {
  let finish;
  const flight = new Promise(resolve => { finish = resolve; });
  const entries = inboxRows(70);
  const page = pageHarness({ initialSearch: 'collection=activity', presentation: 'mobile', initialRows: entries, deleteActivity: () => flight });
  page.button('Select items').props.onClick();
  assert.ok(page.nodes.some(node => node.props.className === 'studio-selection-hint' && node.props.children === 'Tap items to select them'));
  page.nodes.find(node => node.type === 'button' && node.props.children === 'Select all shown').props.onClick();
  assert.equal(page.nodes.some(node => node.props.className === 'studio-selection-hint'), false);
  assert.equal(page.button('Mark read (70)'), undefined);
  const remove = page.button('Delete updates (70)');
  remove.props.onClick(); remove.props.onClick();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0][1].length, 70);
  assert.equal(page.button('Delete updates (70)').props.disabled, true);
  finish(entries.map(row => row.id));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.nodes.some(node => node.type === 'studio-row'), false);
  assert.equal(page.nodes.some(node => node.props['aria-label'] === 'Selected item actions'), false);
  assert.ok(page.nodes.some(node => node.props.role === 'status' && node.props.children === '70 updates deleted'));
});

test('MOBILE unread selection keeps compact Read and Delete with complete accessible names', async () => {
  const page = pageHarness({ initialSearch: 'collection=activity', presentation: 'mobile', initialRows: inboxRows(70, true) });
  selectAll(page);
  const read = page.button('Mark read (70)'), remove = page.button('Delete updates (70)');
  assert.ok(read && remove);
  assert.equal(read.props.children[1].props.children.join(''), 'Read (70)');
  assert.equal(remove.props.children[1].props.children.join(''), 'Delete (70)');
  read.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.calls.filter(call => call[0] === 'mark-read').length, 70);
  assert.equal(page.calls.some(call => call[0] === 'delete'), false);
  selectAll(page);
  assert.equal(page.button('Mark read (70)'), undefined);
  assert.ok(page.button('Delete updates (70)'));
});

test('bulk Activity deletion retains failed selection through partial success and retries', async () => {
  let attempt = 0;
  const page = pageHarness({ initialSearch: 'collection=activity', presentation: 'mobile', initialRows: inboxRows(2),
    deleteActivity: async targets => {
      attempt += 1;
      if (attempt === 1) return [targets[0].id];
      if (attempt === 2) throw Error('Offline');
      return targets.map(row => row.id);
    },
  });
  selectAll(page);
  page.button('Delete updates (2)').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const remaining = page.nodes.filter(node => node.type === 'studio-row');
  assert.equal(remaining.length, 1); assert.equal(remaining[0].props.selected, true);
  assert.match(page.nodes.find(node => node.props.role === 'alert').props.children, /remain selected/);
  page.button('Delete updates (1)').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.nodes.find(node => node.type === 'studio-row').props.selected, true);
  assert.equal(page.button('Delete updates (1)').props.disabled, false);
  page.button('Delete updates (1)').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.nodes.some(node => node.type === 'studio-row'), false);
  assert.equal(page.calls.filter(call => call[0] === 'delete').length, 3);
});

test('late Activity deletion cannot publish feedback or selection into a different account or collection', async () => {
  for (const change of ['account', 'collection']) {
    let finish;
    const flight = new Promise(resolve => { finish = resolve; });
    const page = pageHarness({ initialSearch: 'collection=activity', presentation: 'mobile', initialRows: inboxRows(1), deleteActivity: () => flight });
    selectAll(page); page.button('Delete updates (1)').props.onClick();
    if (change === 'account') page.setAccount('another-account');
    else page.setSearch('collection=bookmarks');
    page.rerender();
    if (change === 'account') assert.equal(page.button('Select items').props.disabled, false, 'An old account deletion cannot lock the new account while its request is still pending.');
    finish(['activity:inbox-0']);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.nodes.some(node => node.props.role === 'status' && /deleted/.test(String(node.props.children))), false);
    assert.equal(page.nodes.some(node => node.props.role === 'alert'), false);
  }
});
