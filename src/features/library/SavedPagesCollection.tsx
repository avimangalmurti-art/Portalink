import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkIcon } from 'lucide-react';
import { useServices } from '../../contexts/ServicesContext';
import { useAccountQuery } from './useAccountQuery';
import { listSavedPages, removeSavedPage, savedPageKey, savedPagePresentation, type SavedPageTarget } from './savedPages';
import { ProjectCover } from '../../components/media/ProjectCover';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';

export function SavedPagesCollection() {
  const { projects } = useServices();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const cursor = cursors[cursors.length - 1];
  const query = useCallback(async () => {
    const batch = await listSavedPages(cursor);
    const ids = [...new Set(batch.items.map((item) => item.projectId))];
    const views = await Promise.all(ids.map(async (id) => {
      try { return await projects.getProjectView(id); }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'not_found') return undefined;
        throw error;
      }
    }));
    const byId = new Map(views.filter((view) => view !== undefined).map((view) => [view.project.id, view]));
    return { nextCursor: batch.nextCursor, items: batch.items.map((target) => ({ target, presentation: savedPagePresentation(target, byId.get(target.projectId)) })) };
  }, [cursor, projects]);
  const state = useAccountQuery(query);
  const items = state.data?.items.filter(({ target }) => !removed.has(savedPageKey(target))) ?? [];
  return <section aria-label="Saved pages">
    <p className="mb-5 text-[13px] text-[var(--text-secondary)]">Individual pages and images, saved separately from their projects. Most recently saved first.</p>
    {state.loading ? <LoadingState label="Loading saved pages" /> : state.error ? <ErrorState title="Unable to load saved pages" description={state.error} onRetry={state.retry} /> : !items.length ? <EmptyState title={cursors.length > 1 || state.data?.nextCursor ? 'No remaining saves on this page' : 'No saved pages yet'} description="Use the bookmark on an individual page or image to keep it here." /> : <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ target, presentation }) => <SavedPageCard key={savedPageKey(target)} target={target} presentation={presentation} onRemoved={() => setRemoved((current) => new Set([...current, savedPageKey(target)]))} />)}
    </ul>}
    <div className="mt-6 flex items-center gap-3" aria-label="Saved pages pagination">
      {cursors.length > 1 && <Button disabled={state.loading} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</Button>}
      {state.data?.nextCursor && <Button disabled={state.loading} onClick={() => { const next = state.data?.nextCursor; if (next) setCursors((current) => [...current, next]); }}>More saved pages</Button>}
    </div>
  </section>;
}

function SavedPageCard({ target, presentation, onRemoved }: { target: SavedPageTarget; presentation: ReturnType<typeof savedPagePresentation>; onRemoved: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function remove() {
    if (pending) return;
    setPending(true); setError(undefined);
    try { await removeSavedPage(target); onRemoved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not remove this saved page.'); }
    finally { setPending(false); }
  }
  return <li className="min-w-0">
    {presentation ? <Link to={presentation.href} aria-label={`Open ${presentation.label} of ${presentation.view.project.title}`} className="card-hover-outline shape-container relative block aspect-[4/3] w-full overflow-hidden bg-[var(--surface-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      <ProjectCover source={presentation.source} kind={presentation.kind} pageNumber={presentation.pageNumber} fit="contain" alt={`${presentation.label} of ${presentation.view.project.title}`} aspectRatio={presentation.aspectRatio} className="h-full w-full" sizes="(min-width: 1280px) 30vw, (min-width: 640px) 46vw, 92vw" />
    </Link> : <div className="shape-container flex aspect-[4/3] items-center justify-center border border-[var(--hairline)] p-5 text-center text-[13px] text-[var(--text-secondary)]">This page was removed or is no longer shared with you.</div>}
    <div className="mt-2 flex items-start gap-2">
      <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{presentation?.label ?? 'Page unavailable'}</p>{presentation && <><p className="truncate text-[13px]" title={presentation.view.project.title}>{presentation.view.project.title}</p><p className="truncate text-[12px] text-[var(--text-secondary)]">{presentation.view.creator.name}</p></>}</div>
      <button type="button" onClick={() => void remove()} disabled={pending} aria-label={`Remove ${presentation ? `${presentation.label} of ${presentation.view.project.title}` : 'unavailable page'} from Saved`} title="Remove saved page" className="shape-compact flex h-9 w-9 shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><InterfaceIcon icon={BookmarkIcon} size="sm" keepColor fill="currentColor" style={{ color: 'var(--engagement-save-selected)' }} /></button>
    </div>
    {error && <p role="alert" className="mt-2 text-[12px] text-[var(--status-danger)]">{error}</p>}
  </li>;
}
