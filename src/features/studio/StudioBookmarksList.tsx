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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ChevronLeftIcon, ArchiveIcon, BellIcon, BookmarkIcon, CopyIcon, EllipsisIcon, MailOpenIcon, PencilIcon, RefreshCwIcon, SearchIcon, Share2Icon, XIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ProjectCover } from '../../components/media/ProjectCover';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import type { ProjectLocation } from '../../types/domain';
import { ProjectEditorDialog } from '../projects/ProjectEditorDialog';
import { useProjectManagement } from '../projects/useProjectManagement';
import { StudioRow } from './StudioRow';
import { StudioActionSheet } from './StudioActionSheet';
import type { StudioRowAction } from './StudioRow';
import { filterStudioRows, studioRowActions, type StudioBookmarkTab, type StudioCategory, type StudioRow as StudioItem } from './studioModel';
import { useStudioData } from './useStudioData';
import { readStudioLocation, STUDIO_BOOKMARK_TABS, studioBulkTargets, studioDate, studioMadeOnDate, studioSharePath } from './studioView';

type Props = {
  onBack: () => void;
  onOpenProject: (id: string, location?: ProjectLocation) => void;
  headerHost?: HTMLElement | null;
  savedRoute?: boolean;
  onNewProject?: () => void;
};

function RowPreview({ row }: { row: StudioItem }) {
  if (row.kind === 'published' || row.kind === 'saved-project') {
    const project = row.project;
    return <ProjectCover source={project.cover} thumbnail={project.coverThumbnail} alt={project.coverAlt || project.title} kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} sizes="48px" />;
  }
  if (row.kind === 'saved-creator' && row.profile) return <CreatorAvatar name={row.profile.name} avatar={row.profile.avatar} className="h-full w-full" shape="squircle" />;
  if (row.kind === 'saved-page' && row.presentation) return <ProjectCover source={row.presentation.source} alt={row.title} kind={row.presentation.kind} pageNumber={row.presentation.pageNumber} sizes="48px" />;
  return <span className="studio-row-fallback"><InterfaceIcon icon={row.kind === 'activity' ? BellIcon : BookmarkIcon} /></span>;
}

/** A private, mobile presentation of existing collections and service actions. */
export function StudioPage({ onBack, onOpenProject, onNewProject, savedRoute = false, headerHost }: Props) {
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
  const collectionTitle = category === 'all' ? 'All' : category[0].toUpperCase() + category.slice(1);
  const data = useStudioData(category, tab);
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
  const mounted = useRef(true);
  const account = useRef(auth.user?.id);
  account.current = auth.user?.id;
  const selectButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const priorSave = useRef(management.editor.result);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
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
  const selectedRows = visibleRows.filter(row => selected.has(row.id));
  const bulk = studioBulkTargets(selectedRows);
  const selectedIds = new Set(selectedRows.map(row => row.id));
  const isRefreshing = data.status === 'loading';
  const canSelect = visibleRows.length > 0 && !bulkPending && !isRefreshing;
  const restoreSelectionFocus = () => requestAnimationFrame(() => {
    const target = selectButton.current;
    (target && !target.disabled ? target : heading.current)?.focus({ preventScroll: true });
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
    const links = paths.map(path => new URL(path, window.location.origin).href);
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
      (remaining?.querySelector<HTMLElement>('button[data-studio-row-control]') ?? heading.current)?.focus({ preventScroll: true });
    });
  }

  const [exportProject,setExportProject]=useState<string|'all'|null>(null);
  function actionsFor(row: StudioItem): StudioRowAction[] {
    const available = studioRowActions(row);
    const definitions: Record<string, StudioRowAction> = {
      open: { id: 'open', label: 'Open', icon: ArchiveIcon, onAction: () => openRow(row) },
      edit: { id: 'edit', label: 'Edit', icon: PencilIcon, onAction: () => { if (row.kind === 'published') management.editor.open(row.project.id); } },
      share: { id: 'share', label: 'Share', icon: Share2Icon, onAction: () => { void shareRows([row]); } },
      'copy-link': { id: 'copy-link', label: 'Copy link', icon: CopyIcon, onAction: () => { void shareRows([row], true); } },
      unsave: { id: 'unsave', label: 'Remove bookmark', icon: BookmarkIcon, onAction: () => { void mutateRow(row, 'unsave'); } },
      'mark-read': { id: 'mark-read', label: 'Mark read', icon: MailOpenIcon, onAction: () => { void mutateRow(row, 'markRead'); } },
    };
    if(row.kind==='saved-page') return [...available.map(id=>({...definitions[id],disabled:data.pendingIds.has(row.id)||bulkPending||isRefreshing})),{id:'cite',label:'Cite in…',onAction:()=>{void (async()=>{try{const imageId=await resolveImageId(row.target.attachmentId);let item=imageId?await resolveCitationItem(imageId):null;if(!item){const id=await resolvePageId(row.target.attachmentId,row.target.pageIndex);if(id)item=await resolveCitationItem(id);}if(item)setCiteItem(item);else setLocalError('This item is unavailable for citation.');}catch{setLocalError('Citation could not be loaded.');}})();}}];
    return [...available.map(id => ({ ...definitions[id], disabled: data.pendingIds.has(row.id) || bulkPending || isRefreshing })),...(row.kind==='published'?[{id:'export',label:'Export',onAction:()=>setExportProject(row.project.id)}]:[])];
  }
  function renderRow(row: StudioItem) {
    const actions = actionsFor(row);
    const leftIds = row.kind === 'published' ? ['share', 'edit'] : row.kind === 'activity' ? ['open', 'mark-read'] : ['open', 'unsave'];
    return <React.Fragment key={row.id}><StudioRow key={row.id} id={row.id} title={row.title} secondary={row.secondary} date={row.kind==='published'?studioMadeOnDate(row.date):studioDate(row.date)} referenceCount={row.kind === 'published' ? Number(citationLabels[row.id]?.split(' ')[0]) || 0 : undefined} onOpenReferences={row.kind === 'published' && row.href ? () => navigate(row.href + '#references') : undefined} leading={<RowPreview row={row} />} unread={row.kind === 'activity' && row.notification.isUnread} selecting={selecting} selected={selectedIds.has(row.id)} pending={data.pendingIds.has(row.id) || bulkPending || isRefreshing} onSelect={() => toggleRow(row.id)} onOpen={actions.some(action => action.id === 'open') ? () => openRow(row) : undefined} actions={leftIds.flatMap(id => actions.filter(action => action.id === id))} primaryAction={actions.find(action => action.id === 'open')} onMenu={() => setSheet({ row })} />{row.kind !== 'published' && citationLabels[row.id]&&<li><button className="studio-text-control" onClick={()=>row.kind==='published'&&row.href?navigate(row.href+'#references'):setSheet({row})}>{citationLabels[row.id]}</button></li>}</React.Fragment>;
  }

  useMobileScreenActions(contextActions('studio', { signedIn: auth.isAuthenticated, owner: true }, { handlers: {
    select: canSelect ? () => setSelecting(true) : undefined,
    newProject: !bulkPending ? onNewProject : undefined,
    reads: () => navigate('/insights'),
    drafts: () => setParams({collection:'drafts'},{replace:true}),
    bookmarks: () => setParams({collection:'bookmarks'},{replace:true}),
  } }), 10, () => setSheet({ view: true }));
  const viewActions: StudioRowAction[] = [{ id: 'refresh', label: 'Refresh', icon: RefreshCwIcon, disabled: data.status === 'loading', onAction: data.refresh },...(category==='published'?[{id:'export',label:'Export',onAction:()=>setExportProject('all')}]:[])];
  const statusLine = data.status === 'loading' ? 'Updating…' : data.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Your private workspace';

  const navigation = <div className="studio-bookmarks-navigation">
        <button type="button" className="studio-bookmarks-back" aria-label={`Back from ${collectionTitle}`} disabled={bulkPending} onClick={back}>{headerHost?<ChevronLeftIcon aria-hidden="true" />:<><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /><span>Back</span></>}</button>
        <div className="studio-bookmarks-controls">
          <button ref={selectButton} type="button" className="studio-text-control" disabled={!selecting && !canSelect || bulkPending} aria-label={selecting ? 'Exit selection' : 'Select items'} aria-pressed={selecting} onClick={() => selecting ? closeSelection() : setSelecting(true)}>{selecting ? 'Done' : 'Select'}</button>
          <div data-inline-screen-actions=""><button type="button" className="mobile-context-button studio-round-control" data-keep-color="" aria-label={`${collectionTitle} options`} aria-haspopup="dialog" disabled={bulkPending} onClick={() => setSheet({ view: true })}><InterfaceIcon icon={EllipsisIcon} /></button></div>
        </div>
      </div>;
  return <section className="mobile-studio" data-mobile-studio="" data-studio-selecting={selecting ? 'true' : 'false'} aria-label="Studio">
    <ScreenBack action={back}>{null}</ScreenBack>
    <header className="studio-header">
      {headerHost ? createPortal(navigation, headerHost) : navigation}
      <div className="studio-heading">
        <h1 ref={heading} tabIndex={-1} className="studio-title">{collectionTitle}</h1>
        <p className="studio-status">{statusLine}</p>
      </div>
      <label className="studio-search"><InterfaceIcon icon={SearchIcon} /><input type="search" aria-label="Search Studio" placeholder={`Search ${collectionTitle.toLowerCase()}`} value={query} disabled={bulkPending} onChange={event => { setQuery(event.target.value); setSelected(new Set()); }} /></label>
      {category === 'bookmarks' && <div className="studio-bookmark-tabs" role="group" aria-label="Saved collection">{STUDIO_BOOKMARK_TABS.map(kind => <button key={kind} type="button" aria-pressed={tab === kind} disabled={bulkPending} onClick={() => chooseTab(kind)}>{kind === 'projects' ? 'Projects' : kind === 'pages' ? 'Pages' : 'Creators'}</button>)}</div>}
      {selecting && <div className="studio-selection-summary"><span role="status">{selectedRows.length} selected</span><button type="button" disabled={!canSelect} onClick={() => setSelected(selectedRows.length === visibleRows.length ? new Set() : new Set(visibleRows.map(row => row.id)))}>{selectedRows.length === visibleRows.length ? 'Deselect all' : 'Select all shown'}</button></div>}
    </header>
    <div ref={scroller} className="studio-content" data-studio-scroll="" aria-busy={data.status === 'loading'}>
      {notice && <p role="status" className="studio-feedback">{notice}</p>}
      {(localError || data.mutationError) && <p role="alert" className="studio-feedback text-[var(--status-danger)]">{localError || data.mutationError}</p>}
      {data.status === 'loading' && !data.rows.length ? <LoadingState kind="studio" label="Loading Studio" /> : null}
      {data.error && <ErrorState title="Some of Studio could not load" description={data.error} onRetry={data.refresh} />}
      {visibleRows.length ? <ul className="studio-list inset-row-group inset-row-group-icons">{visibleRows.map(renderRow)}</ul> : data.status !== 'loading' && !data.error ? <EmptyState title={query ? 'No matching items' : category === 'bookmarks' ? 'No bookmarks yet' : category === 'published' ? 'No published projects yet' : category === 'activity' ? 'No activity yet' : 'No items yet'} description={query ? 'Try another search, or clear this one.' : category === 'bookmarks' ? 'Keep projects, pages and creators here using their bookmark action.' : category === 'published' ? 'Your published projects appear here.' : category === 'activity' ? 'Your updates appear here.' : 'Your work, bookmarks and updates appear here.'} action={query ? { label: 'Clear search', onClick: () => setQuery('') } : undefined} /> : null}
      {data.loadMoreError && <ErrorState title="More saved pages could not load" description={data.loadMoreError} onRetry={() => { void data.loadMore(); }} />}
      {data.hasMore && <div className="studio-load-more"><p>Search and selection cover the pages loaded so far.</p><button type="button" className="studio-text-control" disabled={data.loadingMore || bulkPending} onClick={() => { void data.loadMore(); }}>{data.loadingMore ? 'Loading…' : 'Load more saved pages'}</button></div>}
    </div>
    {selecting && <div className="studio-selection-toolbar" role="toolbar" aria-label="Selected item actions">
      <button type="button" className="studio-round-control" aria-label="Exit selection" disabled={bulkPending} onClick={closeSelection}><InterfaceIcon icon={XIcon} /></button>
      <div className="studio-bulk-actions scrollbar-hidden">
        {bulk.unsave.length > 0 && <button type="button" disabled={bulkPending || isRefreshing} onClick={() => { void runBulk('unsave'); }}><InterfaceIcon icon={BookmarkIcon} /><span>Remove bookmarks ({bulk.unsave.length})</span></button>}
        {bulk.markRead.length > 0 && <button type="button" disabled={bulkPending || isRefreshing} onClick={() => { void runBulk('markRead'); }}><InterfaceIcon icon={MailOpenIcon} /><span>Mark read ({bulk.markRead.length})</span></button>}
        {bulk.share.length > 0 && <button type="button" disabled={bulkPending || isRefreshing} onClick={() => { void shareRows(bulk.share); }}><InterfaceIcon icon={Share2Icon} /><span>Share ({bulk.share.length})</span></button>}
        {!selectedRows.length && <span className="studio-selection-hint">Tap items to select them</span>}
        {selectedRows.length > 0 && !bulk.unsave.length && !bulk.markRead.length && !bulk.share.length && <span className="studio-selection-hint">These updates are already read</span>}
      </div>
    </div>}
    {exportProject&&auth.viewerProfileId&&<ExportSheet profileId={auth.viewerProfileId} projectId={exportProject==='all'?undefined:exportProject} onClose={()=>setExportProject(null)}/>} {sheet && <StudioActionSheet title={'view' in sheet ? collectionTitle : sheet.row.title} actions={('view' in sheet ? viewActions : actionsFor(sheet.row)).map(action => ({ ...action, onAction: () => { setSheet(null); action.onAction(); } }))} onClose={() => setSheet(null)} />}
    {citeItem&&<CiteSheet item={citeItem} onClose={()=>setCiteItem(null)}/>}
    <ProjectEditorDialog management={management} />
  </section>;
}

