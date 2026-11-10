import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeftIcon, SearchIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { DensitySeparator } from '../../components/ui/DensitySeparator';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import type { PublicPortalSummary } from '../../types/portals';
import { WebPortalSearchPopup } from './WebPortalSearchPopup';
import './public-portal-search.css';

function uniquePortals(items: PublicPortalSummary[]) {
  return [...new Map(items.map(portal => [`${portal.profileId}:${portal.id}`, portal])).values()];
}

/** Search and pagination share an account/query identity; old reads never repaint a new search. */
function usePublicPortalDirectory(query: string) {
  const auth = useAuth();
  const { discovery } = useServices();
  const transitioning = auth.isInitializing || auth.phase === 'authenticating' || auth.phase === 'signing-out';
  const account = auth.isAuthenticated && !transitioning ? auth.user?.id ?? null : null;
  const normalized = query.trim().slice(0, 80);
  const scope = useMemo(() => ({ account, login: auth.loginSession, discovery, query: normalized }), [account, auth.loginSession, discovery, normalized]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const version = useRef(0);
  const paging = useRef<typeof scope | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    scope: typeof scope;
    items: PublicPortalSummary[];
    nextOffset: number | null;
    status: 'loading-more' | 'ready' | 'error';
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const request = ++version.current;
    paging.current = null;
    setResult(null);
    if (!scope.account) return;
    const timer = window.setTimeout(() => {
      void scope.discovery.listPublicPortals(scope.query, 0).then(page => {
        if (currentScope.current !== scope || version.current !== request) return;
        setResult({ scope, items: uniquePortals(page.items), nextOffset: page.nextOffset, status: 'ready', error: null });
      }).catch(() => {
        if (currentScope.current !== scope || version.current !== request) return;
        setResult({ scope, items: [], nextOffset: null, status: 'error', error: 'Check your connection and try again.' });
      });
    }, scope.query ? 220 : 0);
    return () => { window.clearTimeout(timer); version.current += 1; };
  }, [scope, attempt]);

  const visible = result?.scope === scope ? result : null;
  const loadMore = useCallback(async () => {
    if (!scope.account || !visible || visible.nextOffset === null || visible.status === 'loading-more' || paging.current === scope) return;
    const request = version.current;
    const offset = visible.nextOffset;
    paging.current = scope;
    setResult(previous => previous?.scope === scope ? { ...previous, status: 'loading-more', error: null } : previous);
    try {
      const page = await scope.discovery.listPublicPortals(scope.query, offset);
      if (currentScope.current !== scope || version.current !== request) return;
      setResult(previous => previous?.scope === scope ? {
        ...previous, items: uniquePortals([...previous.items, ...page.items]), nextOffset: page.nextOffset, status: 'ready', error: null,
      } : previous);
    } catch {
      if (currentScope.current !== scope || version.current !== request) return;
      setResult(previous => previous?.scope === scope ? { ...previous, status: 'error', error: 'Check your connection and try again.' } : previous);
    } finally {
      if (paging.current === scope) paging.current = null;
    }
  }, [scope, visible]);

  return {
    enabled: Boolean(account), transitioning,
    items: visible?.items ?? [], nextOffset: visible?.nextOffset ?? null,
    loading: Boolean(account) && !visible,
    loadingMore: visible?.status === 'loading-more',
    error: visible?.error,
    loadMore,
    retry: () => setAttempt(current => current + 1),
  };
}

/** Public portal identities only; opening a result uses its creator's existing catalogue route. */
export function PublicPortalSearchPage({ onBack }: { onBack: () => void }) {
  const isMobile = usePresentation() === 'mobile';
  const [columns, setColumns] = useState(3);
  const [webColumns, setWebColumns] = useState(6);
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const directory = usePublicPortalDirectory(query);
  const webPopupScope = useMemo(() => ({ account: auth.user?.id ?? null, login: auth.loginSession, query, isMobile }), [auth.user?.id, auth.loginSession, query, isMobile]);
  const [webSelection, setWebSelection] = useState<{ scope: typeof webPopupScope; portal: PublicPortalSummary } | null>(null);
  const currentPopup = useRef({ scope: webPopupScope, selection: webSelection, enabled: directory.enabled });
  currentPopup.current = { scope: webPopupScope, selection: webSelection, enabled: directory.enabled };
  const selectedPortal = !isMobile && directory.enabled && webSelection?.scope === webPopupScope ? webSelection.portal : null;
  useEffect(() => {
    if (isMobile || !directory.enabled || webSelection?.scope !== webPopupScope) setWebSelection(null);
  }, [isMobile, directory.enabled, webPopupScope, webSelection]);
  const displayedColumns = isMobile ? columns : webColumns;
  const setDisplayedColumns = isMobile ? setColumns : setWebColumns;
  const changeQuery = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true, state: location.state });
  };
  const hasResults = directory.items.length > 0;
  return <section data-public-portal-search="" data-compact-portals={isMobile && columns > 3 ? '' : undefined} style={{ '--portal-search-columns': displayedColumns } as React.CSSProperties} aria-labelledby="public-portal-search-title">
    <header className="global-control-header public-portal-search-header">
      <div className="public-portal-search-heading">
        <ScreenBack action={onBack} visibleOnMobile><button data-ui-shape={isMobile ? 'icon' : undefined} type="button" onClick={onBack} aria-label="Go back" className="public-portal-back"><InterfaceIcon icon={ChevronLeftIcon} /></button></ScreenBack>
        <h1 id="public-portal-search-title" className={!isMobile ? 'sr-only' : undefined}>Portal search</h1>
      </div>
      <label className="public-portal-search-field">
        <InterfaceIcon icon={SearchIcon} size="sm" />
        <span className="sr-only">Search public portals</span>
        <input type="search" value={query} maxLength={80} onChange={event => changeQuery(event.currentTarget.value)} placeholder="Search public portals" disabled={!directory.enabled} />
      </label>
      {directory.enabled && <div className="public-portal-search-density">
        <DensitySeparator columns={displayedColumns} maxColumns={isMobile ? 5 : 13} onPreview={setDisplayedColumns} onChange={setDisplayedColumns} label="Portals per row" />
      </div>}
    </header>
    <div className="public-portal-search-scroll scrollbar-overlay">
      {directory.transitioning ? <LoadingState kind="grid" columns={isMobile ? columns : undefined} label="Opening portal search…" />
        : !directory.enabled ? <EmptyState title="Sign in to search portals" action={{ label: 'Sign in', onClick: () => auth.requestAuth('signIn') }} />
        : <>
          {directory.loading && <LoadingState kind="grid" columns={isMobile ? columns : undefined} label="Loading public portals…" />}
          {hasResults && <div className="profile-collection">
            <ul className="profile-collection-grid" aria-label="Public portals" aria-busy={directory.loadingMore}>
              {directory.items.map(portal => <li key={`${portal.profileId}:${portal.id}`}>
                <Link to={buildPath('profileCategory', { profileId: portal.profileId, categoryId: portal.id })} data-ui-shape="row" className="profile-collection-link public-portal-link" title={`${portal.label} — ${portal.creator.name}`} aria-label={`${portal.label} — ${portal.creator.name}`}
                  aria-haspopup={!isMobile ? 'dialog' : undefined} onClick={!isMobile ? event => {
                    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                    event.preventDefault();
                    setWebSelection({ scope: webPopupScope, portal });
                  } : undefined}>
                  <span className="public-portal-mark" aria-hidden="true">
                    <span className="public-portal-glyph">
                      <InterfaceIcon icon={getCategoryIcon(portal.iconName ?? '')} size="xl" keepColor style={{ color: portal.creator.accentColor || 'var(--text-secondary)' }} />
                    </span>
                    <span className="public-portal-avatar"><CreatorAvatar name={portal.creator.name} avatar={portal.creator.avatar} className="h-full w-full text-[12px]" /></span>
                  </span>
                  <span className="profile-collection-name">{portal.label}</span>
                </Link>
              </li>)}
            </ul>
          </div>}
          {directory.error && <ErrorState title={hasResults ? 'More portals could not be loaded' : 'Public portals could not be loaded'} description={directory.error} onRetry={hasResults && directory.nextOffset !== null ? () => void directory.loadMore() : directory.retry} />}
          {!directory.loading && !directory.error && !hasResults && <EmptyState title={query.trim() ? 'No portals found' : 'No public portals yet'} description={query.trim() ? 'Try another portal name.' : undefined} />}
          {directory.loadingMore && <p role="status" className="public-portal-pagination">Loading more portals…</p>}
          {!directory.error && directory.nextOffset !== null && <button type="button" data-ui-control="button" data-control-size="md" data-control-variant="secondary" className="public-portal-pagination" disabled={directory.loadingMore} onClick={() => void directory.loadMore()}>Show more</button>}
        </>}
    </div>
    {selectedPortal && webSelection && <WebPortalSearchPopup key={`${selectedPortal.profileId}:${selectedPortal.id}`} portal={selectedPortal} onClose={() => {
      setWebSelection(current => current === webSelection ? null : current);
    }} onSelect={(profileId, categoryId, projectId) => {
      const current = currentPopup.current;
      if (!current.enabled || current.scope !== webPopupScope || current.selection !== webSelection || profileId !== selectedPortal.profileId || categoryId !== selectedPortal.id) return;
      setWebSelection(null);
      navigate(buildPath('project', { profileId, categoryId, projectId }));
    }} />}
  </section>;
}
