import { PUBLIC_ORIGIN } from '../citations/publicOrigin';
import { usePresentation } from '../../presentation/usePresentation';
import { StudioEmptyState } from './StudioEmptyState';
import { useReferences } from '../references/useReferences';
import { ExportSheet } from '../references/ExportSheet';
import { resolveCitationItem,resolvePageId,resolveImageId,listCitations,citationProject } from '../citations/service';
import { CiteSheet } from '../citations/CiteSheet';
import type { CitationItem } from '../citations/model';
import { useInternalContentShare } from '../sharing/InternalContentShare';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, ChevronLeftIcon, BellIcon, BookmarkIcon, CopyIcon, EllipsisIcon, MailOpenIcon, PencilIcon, RefreshCwIcon, SearchIcon, ShareIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ProjectCover } from '../../components/media/ProjectCover';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { ScreenBack, useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import type { ProjectLocation } from '../../types/domain';
import { ProjectEditorDialog } from '../projects/ProjectEditorDialog';
import { useProjectManagement } from '../projects/useProjectManagement';
import { StudioRow } from './StudioRow';
import { StudioActionSheet } from './StudioActionSheet';
import type { StudioRowAction } from './StudioRow';
import { filterStudioRows, studioRowActions, type StudioBookmarkTab, type StudioCategory, type StudioRow as StudioItem } from './studioModel';
import { useStudioData } from './useStudioData';
import { useActivityScrollAnchor } from './activityScrollAnchor';
import { readStudioLocation, STUDIO_BOOKMARK_TABS, studioBulkTargets, studioDate, studioMadeOnDate, studioSharePath } from './studioView';

export type ActivityRefreshControl = { refresh: () => void; pending: boolean; error: boolean };
type Props = {
  onBack: () => void;
  onOpenProject: (id: string, location?: ProjectLocation) => void;
  headerHost?: HTMLElement | null;
  savedRoute?: boolean;
  onNewProject?: () => void;
  onActivityRefreshControl?: (control: ActivityRefreshControl | null) => void;
};

function RowPreview({ row }: { row: StudioItem }) {
  if (row.kind === 'published' || row.kind === 'saved-project') {
    const project = row.project;
    return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} alt={project.coverAlt || project.title} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} sizes="48px" />;
  }
  if (row.kind === 'saved-creator' && row.profile) return <CreatorAvatar name={row.profile.name} avatar={row.profile.avatar} className="h-full w-full" shape="squircle" />;
  if (row.kind === 'saved-page' && row.presentation) return <ProjectCover source={row.presentation.source} alt={`${row.presentation.label} of ${row.title}`} fit="contain" kind={row.presentation.kind} pageNumber={row.presentation.pageNumber} sizes="48px" />;
  return <span className="studio-row-fallback"><InterfaceIcon icon={row.kind === 'activity' ? BellIcon : BookmarkIcon} /></span>;
}

/** A private, mobile presentation of existing collections and service actions. */
export function StudioPage({ onBack, onOpenProject, onNewProject, savedRoute = false, headerHost, onActivityRefreshControl }: Props) {
  const mobile = usePresentation() === 'mobile';
  const active = useMobileScreenActive();
  const [citeItem,setCiteItem]=useState<CitationItem|null>(null);
  const [citationLabels,setCitationLabels]=useState<Record<string,string>>({});
  const sendContent = useInternalContentShare();
  const {externalReferences}=useReferences();
  const auth = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const location = readStudioLocation(params, savedRoute);
  const category: StudioCategory = location.category;
  const tab = location.tab;
  const collectionTitle = category[0].toUpperCase() + category.slice(1);
  const mobileActivity = mobile && category === 'activity';
  const data = useStudioData(category, tab, { mobileActivity: mobile });
  const refreshStudio = data.refresh;
  const management = useProjectManagement(auth.viewerProfileId);
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<{ row: StudioItem } | { view: true } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const busy = useRef(false);
  const deletionFlight = useRef<{ scope: object } | null>(null);
  const mounted = useRef(true);
  const account = useRef(auth.user?.id);
  account.current = auth.user?.id;
  const selectButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null), feedback = useRef<HTMLDivElement>(null);
  const activityScope = useMemo(() => ({ account: auth.user?.id, category, query, mobile }), [auth.user?.id, category, query, mobile]);
  const currentScope = useRef(activityScope); currentScope.current = activityScope;
  const currentActive = useRef(active); currentActive.current = active;
  const retryFocusOwner = useRef<{ node: HTMLElement; scope: object } | null>(null);
  const feedbackSize = useRef({ scope: activityScope, height: 0 });
  const priorSave = useRef(management.editor.result);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!deletionFlight.current || deletionFlight.current.scope === activityScope) return;
    deletionFlight.current = null;
    busy.current = false;
    setBulkPending(false);
    setSelected(new Set());
    setSelecting(false);
    setNotice(null);
    setLocalError(null);
  }, [activityScope]);
  useEffect(() => {
    setSelected(new Set());
    setSelecting(false);
    setSheet(null);
    setQuery('');
    setNotice(null);
    setLocalError(null);
    scroller.current?.scrollTo({ top: 0 });
  }, [category, tab]);
  useEffect(() => {
    if (management.editor.result && management.editor.result !== priorSave.current) refreshStudio();
    priorSave.current = management.editor.result;
  }, [refreshStudio, management.editor.result]);
  const citationRows=useRef(data.rows);citationRows.current=data.rows;
  const citationRowKey=data.rows.map(row=>row.id).join('|');
  useEffect(()=>{if(!auth.viewerProfileId)return;let live=true;void (async()=>{const records=await listCitations({outgoing:auth.viewerProfileId!});const external=category==='published'?await externalReferences({profileId:auth.viewerProfileId!}):[];const labels:Record<string,string>={};for(const row of citationRows.current){if(row.kind==='published'){const count=records.filter(c=>c.citing_project_id===row.project.id).length+external.filter(c=>c.project_id===row.project.id).length;if(count>0)labels[row.id]=`${count} references`;}else if(row.kind==='saved-page'){const id=await resolvePageId(row.target.attachmentId,row.target.pageIndex)??row.target.attachmentId;const match=records.find(c=>c.cited_item_id===id);if(match){const project=await citationProject(match.citing_project_id);if(project)labels[row.id]=`Cited in «${project.title}»`;}}}if(live)setCitationLabels(labels);})().catch(()=>undefined);return()=>{live=false;};},[citationRowKey,data.updatedAt,auth.viewerProfileId,citeItem,category,externalReferences]);
  const visibleRows = useMemo(() => filterStudioRows(data.rows, query), [data.rows, query]);
  useActivityScrollAnchor({ enabled: mobileActivity, active, scope: activityScope, list: scroller, rowsKey: visibleRows.map(row => row.id).join('|') });
  useLayoutEffect(() => {
    const node = feedback.current;
    if (!mobileActivity || !active || !node) return;
    if (feedbackSize.current.scope !== activityScope) { feedbackSize.current = { scope: activityScope, height: 0 }; node.style.minHeight = ''; }
    // Removing successful Retry feedback must not clamp a reader at the end.
    feedbackSize.current.height = Math.max(feedbackSize.current.height, node.getBoundingClientRect().height);
    node.style.minHeight = `${feedbackSize.current.height}px`;
  }, [mobileActivity, active, activityScope, data.error, data.activityRefreshing]);
  const refreshActivity = () => active && mobileActivity ? Promise.resolve(data.refresh()).then(result => result === true) : Promise.resolve(false);
  const activityRefreshSource = useRef({ active, mobileActivity, refresh: data.refresh });
  activityRefreshSource.current = { active, mobileActivity, refresh: data.refresh };
  const attachRetryFocusOwner = useCallback((node: HTMLElement | null) => {
    const previous = retryFocusOwner.current;
    retryFocusOwner.current = node ? { node, scope: currentScope.current } : null;
    // A reconnect can remove a focused Retry without a new tap. Transfer focus
    // before React removes that node, rather than leaving it on the body.
    if (!node && previous && mounted.current && activityRefreshSource.current.mobileActivity && currentActive.current && currentScope.current === previous.scope && document.activeElement instanceof HTMLElement && previous.node.contains(document.activeElement)) section.current?.focus({ preventScroll: true });
  }, []);
  const requestActivityRefresh = useCallback(() => {
    const current = activityRefreshSource.current;
    if (mounted.current && current.active && current.mobileActivity) void current.refresh();
  }, []);
  useLayoutEffect(() => {
    if (!mobileActivity || !active) return;
    onActivityRefreshControl?.({ refresh: requestActivityRefresh, pending: data.activityRefreshing || data.status === 'loading', error: Boolean(data.error) });
    return () => onActivityRefreshControl?.(null);
  }, [mobileActivity, active, data.activityRefreshing, data.status, data.error, onActivityRefreshControl, requestActivityRefresh]);
  const retryActivity = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (data.activityRefreshing || !active) return;
    const focused = document.activeElement;
    const control = event?.currentTarget ?? (focused instanceof HTMLElement && focused.tagName === 'BUTTON' && scroller.current?.contains(focused) && focused.closest('[role="alert"]') ? focused : null);
    const ownedFocus = Boolean(control && focused === control), scope = activityScope;
    void refreshActivity().then(confirmed => {
      if (confirmed && ownedFocus && mounted.current && currentActive.current && currentScope.current === scope && (document.activeElement === document.body || document.activeElement === control)) section.current?.focus({ preventScroll: true });
    });
  };
  const selectedRows = visibleRows.filter(row => selected.has(row.id));
  const bulk = studioBulkTargets(selectedRows);
  const selectedIds = new Set(selectedRows.map(row => row.id));
  const isRefreshing = data.status === 'loading';
  const canSelect = visibleRows.length > 0 && !bulkPending && !isRefreshing;
  const restoreSelectionFocus = () => requestAnimationFrame(() => {
    const target = selectButton.current;
    (target && !target.disabled ? target : mobile ? searchInput.current : heading.current)?.focus({ preventScroll: true });
  });
  const closeSelection = () => {
    if (busy.current) return;
    setSelecting(false);
    setSelected(new Set());
    restoreSelectionFocus();
  };
  const back = () => { if (selecting) closeSelection(); else onBack(); };

  function chooseTab(next: StudioBookmarkTab) {
    if (busy.current) return;
    setParams({collection:'bookmarks',tab:next}, { replace: true });
  }
  function toggleRow(id: string) {
    if (busy.current) return;
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function openRow(row: StudioItem) {
    if (row.kind === 'published' || row.kind === 'saved-project') onOpenProject(row.project.id, { profileId: row.creator.id, categoryId: row.project.categoryId });
    else if (row.href) {
      if (row.kind === 'activity' && row.notification.isUnread) void data.markRead(row);
      navigate(row.href);
    }
  }
  async function shareRows(rows: StudioItem[], copy = false) {
    const identity = account.current;
    const paths = rows.map(studioSharePath).filter((path): path is string => Boolean(path));
    if (!paths.length) return;
    const links = paths.map(path => new URL(path, PUBLIC_ORIGIN).href);
    setLocalError(null);
    try {
      if (!copy) {
        sendContent({title: links.length === 1 ? rows[0].title : 'Projects from Portalink',url:links.join('\n')});
      } else {
        await copyPublicLink(links.join('\n'));
        if (mounted.current && account.current === identity) setNotice(links.length === 1 ? 'Link copied' : `${links.length} links copied`);
      }
    } catch (error) {
      if (!mounted.current || account.current !== identity || (error instanceof Error && error.name === 'AbortError')) return;
      setLocalError('The link could not be shared. Try Copy link from its options.');
    }
  }
  async function runBulk(kind: 'unsave' | 'markRead') {
    if (busy.current || isRefreshing) return;
    const rows = bulk[kind];
    if (!rows.length) return;
    const identity = account.current;
    busy.current = true;
    setBulkPending(true);
    setLocalError(null);
    const successful = new Set<string>();
    try {
      for (const row of rows) {
        if (!mounted.current || account.current !== identity) return;
        const done = await (kind === 'unsave' ? data.unsave(row) : data.markRead(row));
        if (!mounted.current || account.current !== identity) return;
        if (done) successful.add(row.id);
      }
      const remaining = new Set([...selectedIds].filter(id => !successful.has(id)));
      setSelected(remaining);
      if (successful.size) setNotice(`${successful.size} ${kind === 'unsave' ? (successful.size === 1 ? 'bookmark removed' : 'bookmarks removed') : (successful.size === 1 ? 'update marked read' : 'updates marked read')}`);
      if (successful.size !== rows.length) setLocalError('Some items could not be updated. They remain selected so you can try again.');
      if (remaining.size === 0) {
        setSelecting(false);
        restoreSelectionFocus();
      }
    } finally {
      busy.current = false;
      if (mounted.current && account.current === identity) setBulkPending(false);
    }
  }

  async function mutateRow(row: StudioItem, kind: 'unsave' | 'markRead') {
    const identity = account.current;
    const done = await (kind === 'unsave' ? data.unsave(row) : data.markRead(row));
    if (!done || !mounted.current || account.current !== identity) return;
    setNotice(kind === 'unsave' ? 'Bookmark removed' : 'Update marked read');
    requestAnimationFrame(() => {
      // Do not steal focus from a destination or dialog opened while saving.
      if (document.querySelector('[aria-modal="true"]')) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement && !active.closest('[data-studio-row]')) return;
      const remaining = Array.from(scroller.current?.querySelectorAll<HTMLElement>('[data-studio-row]') ?? []).find(element => element.dataset.studioRow === row.id);
      (remaining?.querySelector<HTMLElement>('button[data-studio-row-control]') ?? (mobile ? searchInput.current : heading.current))?.focus({ preventScroll: true });
    });
  }

  async function deleteActivityRows(rows: StudioItem[], selection = false) {
    if (busy.current || isRefreshing || data.activityRefreshing) return;
    const targets = rows.filter(row => row.kind === 'activity');
    if (!targets.length) return;
    const identity = account.current, scope = currentScope.current;
    const flight = { scope };
    deletionFlight.current = flight;
    const current = () => mounted.current && deletionFlight.current === flight && account.current === identity && currentScope.current === scope;
    busy.current = true;
    setBulkPending(true);
    setLocalError(null);
    try {
      const confirmed = new Set(await data.deleteActivity(targets));
      if (!current()) return;
      const successful = new Set(targets.filter(row => confirmed.has(row.id)).map(row => row.id));
      const remaining = new Set([...selectedIds].filter(id => !successful.has(id)));
      if (selection) setSelected(remaining);
      if (successful.size) setNotice(`${successful.size} ${successful.size === 1 ? 'update deleted' : 'updates deleted'}`);
      if (successful.size !== targets.length) setLocalError(selection
        ? 'Some updates could not be deleted. They remain selected so you can try again.'
        : 'This update could not be deleted. Please try again.');
      if (successful.size === targets.length && (!selection || remaining.size === 0)) {
        if (selection) setSelecting(false);
        restoreSelectionFocus();
      }
    } catch {
      if (current()) setLocalError(selection
        ? 'Updates could not be deleted. They remain selected so you can try again.'
        : 'This update could not be deleted. Please try again.');
    } finally {
      if (deletionFlight.current === flight) {
        deletionFlight.current = null;
        busy.current = false;
        if (mounted.current) setBulkPending(false);
      }
    }
  }

  const [exportProject,setExportProject]=useState<string|'all'|null>(null);
  function actionsFor(row: StudioItem): StudioRowAction[] {
    const available = studioRowActions(row);
    const definitions: Record<string, StudioRowAction> = {
      open: { id: 'open', label: 'Open', icon: ArrowRightIcon, onAction: () => openRow(row) },
      edit: { id: 'edit', label: 'Edit', icon: PencilIcon, onAction: () => { if (row.kind === 'published') management.editor.open(row.project.id); } },
      share: { id: 'share', label: 'Share', icon: ShareIcon, onAction: () => { void shareRows([row]); } },
      'copy-link': { id: 'copy-link', label: 'Copy link', icon: CopyIcon, onAction: () => { void shareRows([row], true); } },
      unsave: { id: 'unsave', label: 'Remove bookmark', icon: BookmarkIcon, onAction: () => { void mutateRow(row, 'unsave'); } },
      'mark-read': { id: 'mark-read', label: 'Mark read', icon: MailOpenIcon, onAction: () => { void mutateRow(row, 'markRead'); } },
      delete: { id: 'delete', label: 'Delete update', icon: Trash2Icon, destructive: true, onAction: () => { void deleteActivityRows([row]); } },
    };
    if(row.kind==='saved-page') return [...available.map(id=>({...definitions[id],disabled:data.pendingIds.has(row.id)||bulkPending||isRefreshing})),{id:'cite',label:'Cite in…',onAction:()=>{void (async()=>{try{const imageId=await resolveImageId(row.target.attachmentId);let item=imageId?await resolveCitationItem(imageId):null;if(!item){const id=await resolvePageId(row.target.attachmentId,row.target.pageIndex);if(id)item=await resolveCitationItem(id);}if(item)setCiteItem(item);else setLocalError('This item is unavailable for citation.');}catch{setLocalError('Citation could not be loaded.');}})();}}];
    return [...available.map(id => ({ ...definitions[id], disabled: data.pendingIds.has(row.id) || bulkPending || isRefreshing || id === 'delete' && data.activityRefreshing })),...(row.kind==='published'?[{id:'export',label:'Export',onAction:()=>setExportProject(row.project.id)}]:[])];
  }
  function renderRow(row: StudioItem) {
    const actions = actionsFor(row);
    const leftIds = row.kind === 'published' ? ['share', 'edit'] : row.kind === 'activity' ? ['open', 'mark-read', 'delete'] : ['open', 'unsave'];
    return <React.Fragment key={row.id}><StudioRow key={row.id} id={row.id} title={row.title} secondary={row.secondary} date={row.kind==='published'?studioMadeOnDate(row.date):studioDate(row.date)} referenceCount={row.kind === 'published' ? Number(citationLabels[row.id]?.split(' ')[0]) || 0 : undefined} onOpenReferences={row.kind === 'published' && row.href ? () => navigate(row.href + '#references') : undefined} leading={<RowPreview row={row} />} unread={row.kind === 'activity' && row.notification.isUnread} selecting={selecting} selected={selectedIds.has(row.id)} pending={data.pendingIds.has(row.id) || bulkPending || isRefreshing} onSelect={() => toggleRow(row.id)} onOpen={actions.some(action => action.id === 'open') ? () => openRow(row) : undefined} actions={leftIds.flatMap(id => actions.filter(action => action.id === id))} primaryAction={actions.find(action => action.id === 'open')} onMenu={() => setSheet({ row })} />{row.kind !== 'published' && citationLabels[row.id]&&<li><button data-ui-shape="action" className="studio-text-control" onClick={()=>row.kind==='published'&&row.href?navigate(row.href+'#references'):setSheet({row})}>{citationLabels[row.id]}</button></li>}</React.Fragment>;
  }

  useMobileScreenActions(contextActions('studio', { signedIn: auth.isAuthenticated, owner: true }, { handlers: {
    select: canSelect ? () => setSelecting(true) : undefined,
    newProject: !bulkPending ? onNewProject : undefined,
    reads: () => navigate('/insights'),
    drafts: () => setParams({collection:'drafts'},{replace:true}),
    bookmarks: () => setParams({collection:'bookmarks'},{replace:true}),
  } }), 10, () => setSheet({ view: true }));
  const viewActions: StudioRowAction[] = [{ id: 'refresh', label: mobileActivity ? data.activityRefreshing ? 'Refreshing…' : data.error ? 'Retry' : 'Refresh' : 'Refresh', icon: RefreshCwIcon, disabled: data.status === 'loading' || mobileActivity && data.activityRefreshing, onAction: data.refresh },...(category==='published'?[{id:'export',label:'Export',onAction:()=>setExportProject('all')}]:[])];
  const statusLine = data.status === 'loading' ? 'Updating…' : data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Your private workspace';

  const selectionControl = <button ref={selectButton} type="button" data-ui-shape="action" className="studio-text-control" disabled={!selecting && !canSelect || bulkPending} aria-label={selecting ? 'Exit selection' : 'Select items'} aria-pressed={selecting} onClick={() => selecting ? closeSelection() : setSelecting(true)}>{selecting ? 'Done' : 'Select'}</button>;
  const search = <label data-ui-shape="field" className="studio-search"><InterfaceIcon icon={SearchIcon} /><input ref={mobile ? searchInput : undefined} type="search" aria-label="Search Studio" placeholder={`Search ${collectionTitle.toLowerCase()}`} value={query} disabled={bulkPending} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} /></label>;
  const navigation = <div className="studio-bookmarks-navigation">
        <button data-ui-shape={headerHost ? "icon" : "action"} type="button" className="studio-bookmarks-back" aria-label={`Back from ${collectionTitle}`} disabled={bulkPending} onClick={back}>{headerHost?<InterfaceIcon icon={ChevronLeftIcon} size="lg" mirroredInRtl />:<><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /><span>Back</span></>}</button>
        <div className="studio-bookmarks-controls">
          {selectionControl}
          <div data-inline-screen-actions=""><button data-ui-shape="capsule" type="button" className="mobile-context-button studio-round-control" data-keep-color="" aria-label={`${collectionTitle} options`} aria-haspopup="dialog" disabled={bulkPending} onClick={() => setSheet({ view: true })}><InterfaceIcon icon={EllipsisIcon} /></button></div>
        </div>
      </div>;
  return <section ref={section} tabIndex={mobileActivity ? -1 : undefined} className="mobile-studio" data-mobile-studio="" data-studio-activity={mobileActivity ? '' : undefined} data-studio-selecting={selecting ? 'true' : 'false'} aria-label="Studio" onFocusCapture={mobileActivity ? event => { const owner = retryFocusOwner.current; if (owner?.node.contains(event.target)) owner.scope = activityScope; } : undefined}>
    <ScreenBack action={back}>{null}</ScreenBack>
    <header className="studio-header">
      {!mobile && (headerHost ? createPortal(navigation, headerHost) : navigation)}
      {!mobile && <div className="studio-heading">
        <h1 ref={heading} tabIndex={-1} className="studio-title">{collectionTitle}</h1>
        <p className="studio-status">{statusLine}</p>
      </div>}
      {mobile ? <div className="studio-inline-toolbar">{selecting && <button data-ui-shape="icon" type="button" className="studio-selection-back" aria-label="Back from selection" disabled={bulkPending} onClick={closeSelection}><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></button>}{search}{selectionControl}</div> : search}
      {category === 'bookmarks' && <div data-ui-shape="capsule" className="studio-bookmark-tabs" role="group" aria-label="Saved collection">{STUDIO_BOOKMARK_TABS.map(kind => <button data-ui-shape="capsule" key={kind} type="button" aria-pressed={tab === kind} disabled={bulkPending} onClick={() => chooseTab(kind)}>{kind === 'projects' ? 'Projects' : kind === 'pages' ? 'Pages' : 'Creators'}</button>)}</div>}
      {selecting && <div className="studio-selection-summary"><span role="status">{selectedRows.length} selected</span><button data-ui-control={mobileActivity ? 'button' : undefined} data-ui-shape={mobileActivity ? 'action' : undefined} data-control-size={mobileActivity ? 'md' : undefined} type="button" disabled={!canSelect} onClick={() => setSelected(selectedRows.length === visibleRows.length ? new Set() : new Set(visibleRows.map(row => row.id)))}>{selectedRows.length === visibleRows.length ? 'Deselect all' : 'Select all shown'}</button></div>}
    </header>
    <div ref={scroller} className="studio-content" data-studio-scroll="" aria-busy={data.status === 'loading' || mobileActivity && data.activityRefreshing}>
      {notice && <p role="status" className="studio-feedback">{notice}</p>}
      {(localError || data.mutationError) && <p role="alert" className="studio-feedback text-[var(--status-danger)]">{localError || data.mutationError}</p>}
      {data.status === 'loading' && !data.rows.length ? <LoadingState kind="studio" label="Loading Studio" /> : null}
      {data.error && !(mobileActivity && data.rows.length > 0) && (mobileActivity ? <div ref={attachRetryFocusOwner}><ErrorState title="Some of Studio could not load" description={data.error} onRetry={() => retryActivity()} /></div> : <ErrorState title="Some of Studio could not load" description={data.error} onRetry={data.refresh} />)}
      {visibleRows.length ? <ul className="studio-list inset-row-group inset-row-group-icons">{visibleRows.map(renderRow)}</ul> : data.status !== 'loading' && !data.error ? <EmptyState title={query ? 'No matching items' : category === 'bookmarks' ? 'No bookmarks yet' : category === 'published' ? 'No published projects yet' : category === 'activity' ? 'No activity yet' : 'No items yet'} description={query ? 'Try another search, or clear this one.' : category === 'bookmarks' ? 'Keep projects, pages and creators here using their bookmark action.' : category === 'published' ? 'Your published projects appear here.' : category === 'activity' ? 'Your updates appear here.' : 'Your items appear here.'} action={query ? { label: 'Clear search', onClick: () => setQuery('') } : undefined} /> : null}
      {mobileActivity && data.rows.length > 0 && <div ref={feedback} data-activity-refresh-feedback="">{data.error && <><p role="alert" className="studio-feedback text-[var(--status-danger)]">{data.error}</p><button ref={attachRetryFocusOwner} type="button" data-ui-shape="action" className="studio-text-control" aria-disabled={data.activityRefreshing || undefined} aria-busy={data.activityRefreshing || undefined} onClick={retryActivity}>{data.activityRefreshing ? 'Refreshing…' : 'Retry'}</button></>}</div>}
      {data.loadMoreError && <ErrorState title="More saved pages could not load" description={data.loadMoreError} onRetry={() => { void data.loadMore(); }} />}
      {data.hasMore && <div className="studio-load-more"><p>Search and selection cover the pages loaded so far.</p><button type="button" data-ui-shape="action" className="studio-text-control" disabled={data.loadingMore || bulkPending} onClick={() => { void data.loadMore(); }}>{data.loadingMore ? 'Loading…' : 'Load more saved pages'}</button></div>}
    </div>
    {selecting && <div className="studio-selection-toolbar" role="toolbar" aria-label="Selected item actions">
      <button data-ui-control={mobileActivity ? 'icon' : undefined} data-ui-shape={mobileActivity ? 'icon' : undefined} data-control-size={mobileActivity ? 'md' : undefined} data-control-variant={mobileActivity ? 'ghost' : undefined} type="button" className="studio-round-control" aria-label="Exit selection" disabled={bulkPending} onClick={closeSelection}><InterfaceIcon icon={XIcon} /></button>
      <div className="studio-bulk-actions scrollbar-hidden">
        {bulk.unsave.length > 0 && <button data-ui-control={mobileActivity ? 'button' : undefined} data-ui-shape={mobileActivity ? 'action' : undefined} data-control-size={mobileActivity ? 'md' : undefined} data-control-variant={mobileActivity ? 'ghost' : undefined} type="button" disabled={bulkPending || isRefreshing} onClick={() => { void runBulk('unsave'); }}><InterfaceIcon icon={BookmarkIcon} /><span>Remove bookmarks ({bulk.unsave.length})</span></button>}
        {bulk.markRead.length > 0 && <button data-ui-control={mobileActivity ? 'button' : undefined} data-ui-shape={mobileActivity ? 'action' : undefined} data-control-size={mobileActivity ? 'md' : undefined} data-control-variant={mobileActivity ? 'ghost' : undefined} type="button" aria-label={mobileActivity ? `Mark read (${bulk.markRead.length})` : undefined} disabled={bulkPending || isRefreshing} onClick={() => { void runBulk('markRead'); }}><InterfaceIcon icon={MailOpenIcon} /><span>{mobileActivity ? 'Read' : 'Mark read'} ({bulk.markRead.length})</span></button>}
        {bulk.deleteActivity.length > 0 && <button data-ui-control={mobileActivity ? 'button' : undefined} data-ui-shape={mobileActivity ? 'action' : undefined} data-control-size={mobileActivity ? 'md' : undefined} data-control-variant={mobileActivity ? 'ghost' : undefined} type="button" aria-label={`Delete updates (${bulk.deleteActivity.length})`} disabled={bulkPending || isRefreshing || data.activityRefreshing} onClick={() => { void deleteActivityRows(bulk.deleteActivity, true); }}><InterfaceIcon icon={Trash2Icon} /><span>Delete ({bulk.deleteActivity.length})</span></button>}
        {bulk.share.length > 0 && <button data-ui-control={mobileActivity ? 'button' : undefined} data-ui-shape={mobileActivity ? 'action' : undefined} data-control-size={mobileActivity ? 'md' : undefined} data-control-variant={mobileActivity ? 'ghost' : undefined} type="button" disabled={bulkPending || isRefreshing} onClick={() => { void shareRows(bulk.share); }}><InterfaceIcon icon={ShareIcon} /><span>Share ({bulk.share.length})</span></button>}
        {!selectedRows.length && <span className="studio-selection-hint">Tap items to select them</span>}
        {selectedRows.length > 0 && !bulk.unsave.length && !bulk.markRead.length && !bulk.deleteActivity.length && !bulk.share.length && <span className="studio-selection-hint">These updates are already read</span>}
      </div>
    </div>}
    {exportProject&&auth.viewerProfileId&&<ExportSheet profileId={auth.viewerProfileId} projectId={exportProject==='all'?undefined:exportProject} onClose={()=>setExportProject(null)}/>} {sheet && <StudioActionSheet title={'view' in sheet ? collectionTitle : sheet.row.title} actions={('view' in sheet ? viewActions : actionsFor(sheet.row)).map(action => ({ ...action, onAction: () => { setSheet(null); action.onAction(); } }))} onClose={() => setSheet(null)} />}
    {citeItem&&<CiteSheet item={citeItem} onClose={()=>setCiteItem(null)}/>}
    <ProjectEditorDialog management={management} />
  </section>;
}

