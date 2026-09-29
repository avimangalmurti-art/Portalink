import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProjectPreviewCard } from '../../components/profile/ProjectPreviewCard';
import { PreviewMetrics } from '../../components/profile/ProjectHoverDetails';
import { mediaInteractionRequest } from '../media-interactions/mediaInteractionRequest';
import { BookmarkIcon } from 'lucide-react';
import { useServices } from '../../contexts/ServicesContext';
import { useAccountQuery } from './useAccountQuery';
import { removeSavedPage, savedPageKey, savedPagePresentation, type SavedPageTarget } from './savedPages';
import { loadSavedPageBatch } from './collectionQueries';
import { ProjectCover } from '../../components/media/ProjectCover';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { buildPath } from '../../app/routes';

export function SavedPagesCollection() {
  const navigate = useNavigate();
  const { projects } = useServices();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const cursor = cursors[cursors.length - 1];
  const query = useCallback(() => loadSavedPageBatch(projects, cursor), [cursor, projects]);
  const state = useAccountQuery(query);
  const items = state.data?.items.filter(({ target }) => !removed.has(savedPageKey(target))) ?? [];
  const isEmptyLibrary = cursors.length === 1 && !state.data?.nextCursor;
  return <section aria-label="Saved pages">
    <p className="mb-5 text-[13px] text-[var(--text-secondary)]">Individual pages and images, saved separately from their projects. Most recently saved first.</p>
    {state.loading ? <LoadingState label="Loading saved pages" /> : state.error ? <ErrorState title="Unable to load saved pages" description={state.error} onRetry={state.retry} /> : !items.length ? <EmptyState title={isEmptyLibrary ? 'No saved pages yet' : 'No remaining saves on this page'} description="Use the bookmark on an individual page or image to keep it here." action={isEmptyLibrary ? { label: 'Explore the world', onClick: () => navigate(buildPath('portalink')) } : undefined} /> : <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ target, presentation }) => <SavedPageCard key={savedPageKey(target)} target={target} presentation={presentation} onRemoved={() => setRemoved((current) => new Set([...current, savedPageKey(target)]))} />)}
    </ul>}
    <div className="mt-6 flex items-center gap-3" aria-label="Saved pages pagination">
      {cursors.length > 1 && <Button disabled={state.loading} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</Button>}
      {state.data?.nextCursor && <Button disabled={state.loading} onClick={() => { const next = state.data?.nextCursor; if (next) setCursors((current) => [...current, next]); }}>More saved pages</Button>}
    </div>
  </section>;
}

function SavedPageCard({ target, presentation, onRemoved }: { target: SavedPageTarget; presentation: ReturnType<typeof savedPagePresentation>; onRemoved: () => void }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function remove() {
    if (pending) return;
    setPending(true); setError(undefined);
    try { await removeSavedPage(target); onRemoved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove this saved page.'); }
    finally { setPending(false); }
  }
  return <li className="min-w-0 self-start">
    {presentation ? <ProjectPreviewCard project={presentation.view.project} creator={presentation.view.creator}
      label={`Open ${presentation.label} of ${presentation.view.project.title}`} onOpen={() => navigate(presentation.href)}
      href={presentation.href}
      aspectRatio={4 / 3} showEngagementMetrics={false}
      metrics={<SavedPageMetrics target={target} label={presentation.label} onOpen={() => navigate(presentation.href)} />}
      footerEnd={<button type="button" onClick={() => void remove()} disabled={pending} aria-label={`Remove ${presentation ? `${presentation.label} of ${presentation.view.project.title}` : 'unavailable page'} from Saved`} title="Remove saved page" className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><InterfaceIcon icon={BookmarkIcon} size="sm" keepColor fill="currentColor" style={{ color: 'var(--engagement-save-selected)' }} /></button>}
      cover={<ProjectCover source={presentation.source} kind={presentation.kind} pageNumber={presentation.pageNumber} fit="contain" alt={`${presentation.label} of ${presentation.view.project.title}`} aspectRatio={presentation.aspectRatio} className="h-full w-full" sizes="(min-width: 1280px) 30vw, (min-width: 640px) 46vw, 92vw" />} />
      : <div className="shape-container border border-[var(--hairline)] p-5 text-center text-[13px] text-[var(--text-secondary)]">
        <p>This page was removed or is no longer shared with you.</p>
        <button type="button" onClick={() => void remove()} disabled={pending} aria-label="Remove unavailable page from Saved" title="Remove saved page" className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><InterfaceIcon icon={BookmarkIcon} size="sm" keepColor fill="currentColor" style={{ color: 'var(--engagement-save-selected)' }} /></button>
      </div>}
    {error && <p role="alert" className="mt-2 text-[12px] text-[var(--status-danger)]">{error}</p>}
  </li>;
}

function SavedPageMetrics({ target, label, onOpen }: { target: SavedPageTarget; label: string; onOpen: () => void }) {
  // Reading a preview must not consume/replay the viewer's pending actions.
  const query = useCallback(() => mediaInteractionRequest<{
    counts: Record<'like' | 'save' | 'repost', number>;
    comments: unknown[];
  }>(`/api/media-interactions?${new URLSearchParams({ projectId: target.projectId, attachmentId: target.attachmentId, pageIndex: String(target.pageIndex) })}`), [target.projectId, target.attachmentId, target.pageIndex]);
  const activity = useAccountQuery(query);
  const record = !activity.loading && !activity.error ? activity.data : null;
  return <div className="flex min-w-0 flex-col gap-1">
    <span className="text-[11px] font-semibold">{label}</span>
    <PreviewMetrics counts={record?.counts ?? { like: null, save: null, repost: null }} commentCount={record?.comments.length ?? null} onOpenComments={onOpen} />
  </div>;
}
