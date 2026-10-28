import { useAuth } from '../contexts/AuthContext';
import { readRecentAccounts, rememberAccount, forgetAccount } from '../features/follows/recentAccounts';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, XIcon } from 'lucide-react';
import { useServices } from '../contexts/ServicesContext';
import type { FeedCreator } from '../types/domain';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';
import { usePresentation } from '../presentation/usePresentation';
import { ScreenBack, useMobileScreenActive } from '../presentation/mobile/MobileBackNavigation';
import { motionEase, motionMs, reducedMotion } from '../presentation/motion/motion';

const EMPTY_ACCOUNTS: FeedCreator[] = [];

export function SearchAccountsPage({ query, onQueryChange, onOpenCreator, onWarmCreator, onBack }: {
  query: string; onQueryChange: (value: string) => void; onOpenCreator: (id: string) => void; onWarmCreator?: (id: string) => void; onBack?: () => void;
}) {
  const mobile = usePresentation() === 'mobile';
  const SearchField = mobile ? 'textarea' : 'input';
  const { discovery } = useServices();
  const auth = useAuth();
  const canSearch = auth.isAuthenticated;
  const active = useMobileScreenActive();
  const activeRef = useRef(active);
  activeRef.current = active;
  const [, refreshRecent] = useState(0);
  const recent = auth.isAuthenticated ? readRecentAccounts(auth.user?.id) : EMPTY_ACCOUNTS;
  const term = query.trim();
  const account = auth.isAuthenticated ? auth.user?.id ?? null : null;
  const scope = useMemo(() => ({ term, discovery, mobile, account, canSearch }), [term, discovery, mobile, account, canSearch]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const request = useRef(0);
  const busy = useRef(false);
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const reveal = useRef<{ scope: typeof scope; start: number } | null>(null);
  const animations = useRef<Animation[]>([]);
  const interrupted = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<{ scope: typeof scope; offset: number; status: 'loading' | 'error' | 'done'; failed: boolean; height?: number } | null>(null);
  const [result, setResult] = useState<{ scope: typeof scope; term: string; people: FeedCreator[]; status: 'loading' | 'ready' | 'error'; more: boolean }>({ scope, term: '', people: [], status: 'ready', more: false });
  const stopReveal = useCallback(() => {
    reveal.current = null;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
  }, []);
  useEffect(() => {
    const version = ++request.current;
    busy.current = false;
    setPage(null);
    setResult({ scope, term, people: [], status: term ? 'loading' : 'ready', more: false });
    if (!term || !canSearch) return;
    const timer = window.setTimeout(() => {
      void (discovery.searchAccounts ? discovery.searchAccounts(term) : Promise.reject(new Error('Search unavailable'))).then(people => {
        if (request.current === version && scopeRef.current === scope) setResult({ scope, term, people, status: 'ready', more: people.length === 30 });
      }).catch(() => {
        if (request.current === version && scopeRef.current === scope) setResult({ scope, term, people: [], status: 'error', more: false });
      });
    }, 220);
    return () => { window.clearTimeout(timer); request.current++; };
  }, [term, discovery, attempt, scope, canSearch]);
  const current = result.term === term && result.scope === scope;
  const people = current ? result.people : EMPTY_ACCOUNTS;
  const loading = Boolean(term) && (!current || result.status === 'loading');
  const currentPage = mobile && page?.scope === scope ? page : null;

  useLayoutEffect(() => {
    const pending = reveal.current;
    reveal.current = null;
    if (!mobile || !active || !pending || pending.scope !== scope || interrupted.current || reducedMotion()) return;
    const duration = motionMs('fast');
    if (!duration || !list.current) return;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0, bottom = top + (viewport?.height ?? window.innerHeight);
    // Only the appended, visible rows paint once; existing results never fade.
    for (const row of Array.from(list.current.children).slice(pending.start)) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= top || rect.top >= bottom || !(row instanceof HTMLElement) || typeof row.animate !== 'function') continue;
      try {
        const animation = row.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: motionEase() });
        animations.current.push(animation);
        const finish = () => { animations.current = animations.current.filter(item => item !== animation); animation.cancel(); };
        void animation.finished.then(finish, finish);
      } catch { stopReveal(); }
    }
    return () => {
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
    };
  }, [mobile, active, scope, people, stopReveal]);

  useEffect(() => {
    if (!mobile || !active) { stopReveal(); return; }
    const stop = () => { interrupted.current = true; stopReveal(); };
    const reduce = () => { if (reducedMotion()) stop(); };
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'popstate']) window.addEventListener(event, stop, { capture: true, passive: true });
    media?.addEventListener?.('change', reduce);
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(reduce) : null;
    const hosts = new Set<Element>([document.documentElement]);
    for (const host of [section.current?.closest('.codex-shell'), document.querySelector('#app-viewport')]) if (host) hosts.add(host);
    for (const host of hosts) observer?.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => {
      for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'popstate']) window.removeEventListener(event, stop, true);
      media?.removeEventListener?.('change', reduce);
      observer?.disconnect();
      stop();
    };
  }, [mobile, active, scope, stopReveal]);

  function preserveRemovedControlFocus(control: HTMLElement | null) {
    if (mobile && activeRef.current && control && document.activeElement === control) section.current?.closest('main')?.focus({ preventScroll: true });
  }

  async function loadMore() {
    if (!canSearch || !current || busy.current || !result.more || !discovery.searchAccounts || (mobile && !activeRef.current)) return;
    const version = request.current;
    const offset = currentPage?.status === 'error' ? currentPage.offset : people.length;
    const visibleFooterHeight = mobile ? footer.current?.getBoundingClientRect().height : undefined;
    busy.current = true;
    interrupted.current = false;
    if (mobile) setPage({ scope, offset, status: 'loading', failed: currentPage?.failed ?? false });
    else setResult(value => ({ ...value, status: 'loading' }));
    try {
      const next = await discovery.searchAccounts(term, offset);
      if (request.current === version && scopeRef.current === scope) {
        if (mobile) {
          // Keep the final footer's space when it disappears, including an empty
          // last page, so the browser cannot clamp the current reading position.
          const height = next.length < 30 ? footer.current?.getBoundingClientRect().height || visibleFooterHeight : undefined;
          if (next.length < 30) preserveRemovedControlFocus(moreButton.current);
          setPage(next.length < 30 ? { scope, offset, status: 'done', failed: false, height } : null);
          if (activeRef.current && !interrupted.current) reveal.current = { scope, start: people.length };
        }
        setResult({ scope, term, people: [...people, ...next], status: 'ready', more: next.length === 30 });
      }
    } catch {
      if (request.current === version && scopeRef.current === scope) {
        if (mobile) setPage({ scope, offset, status: 'error', failed: true });
        else setResult(value => ({ ...value, status: 'error' }));
      }
    } finally { if (request.current === version && scopeRef.current === scope) busy.current = false; }
  }
  if (!canSearch) return <section className="px-5 py-8" aria-label="Search accounts"><EmptyState title="Find people on Portalink" description="Create an account or sign in to search profiles." action={{ label: 'Create account', onClick: () => auth.requestAuthenticatedDestination({ kind: 'route', path: '/search', label: 'search accounts' }, 'signUp') }} secondaryAction={onBack ? { label: 'Back to Home', onClick: onBack } : undefined} /></section>;
  return <section ref={section} data-account-search className="flex h-full min-h-0 flex-col px-5 py-5" aria-label="Search">
    <header className="account-search-header shrink-0">
    {onBack ? <ScreenBack visibleOnMobile action={onBack}><button type="button" aria-label="Back" className="account-search-back mb-3 flex h-11 w-11 shrink-0 items-center justify-center self-start" onClick={onBack}><ArrowLeftIcon aria-hidden="true" size={24} /></button></ScreenBack> : null}
    <h1 className="mb-4 text-xl font-semibold">Search</h1>
    <label className="mb-4 block"><span className="sr-only">Search accounts</span><SearchField data-ui-shape="field" {...(mobile ? { rows: 1, wrap: 'off', role: 'searchbox' } : { type: 'search' })} name="account-search-query" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onQueryChange(mobile ? event.target.value.replace(/[\r\n]+/g, ' ') : event.target.value)} onKeyDown={event => { if (mobile && event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault(); }} placeholder={mobile ? 'Search accounts' : 'Search by name or handle'} className={`min-h-11 w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]${mobile ? ' block h-11 resize-none overflow-x-auto whitespace-nowrap' : ''}`} maxLength={80} /></label>
    </header>
    <div className="account-search-results min-h-0 flex-1 overflow-y-auto pb-24" style={mobile ? { overflowAnchor: 'none' } : undefined}>
      {!term && !recent.length && <p className="py-5 text-sm text-[var(--text-secondary)]">Search by name or handle.</p>}

      {loading ? <LoadingState label="Searching accounts…" /> : null}
      {current && result.status === 'error' ? <ErrorState title="Accounts could not be searched" description="Check your connection and try again." onRetry={() => { if (mobile) { const control = document.activeElement; if (control instanceof HTMLElement && section.current?.contains(control) && control.matches('button')) preserveRemovedControlFocus(control); } setAttempt(value => value + 1); }} /> : null}
      <ul ref={list} aria-label={term ? "Search results" : "Recent accounts"} className="inset-row-group inset-row-group-icons account-search-list">{(term ? people : recent).map(person => <li key={person.id} className={mobile ? "flex items-center" : undefined}><button type="button" className={`flex min-h-16 ${mobile ? 'min-w-0 flex-1' : 'w-full'} items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`} onClick={() => { if (auth.isAuthenticated) rememberAccount(auth.user?.id, person); onOpenCreator(person.id); }} onPointerEnter={auth.isAuthenticated ? () => onWarmCreator?.(person.id) : undefined} onFocus={auth.isAuthenticated ? () => onWarmCreator?.(person.id) : undefined}>
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl"><CreatorAvatar name={person.name} avatar={person.avatar} className="h-full w-full" /></span>
        <span className="min-w-0"><strong className="block truncate">{person.name}</strong><span className="block truncate text-sm text-[var(--text-secondary)]">{person.kind}</span>{person.location ? <span className="block truncate text-sm text-[var(--text-secondary)]">{person.location}</span> : null}</span>
      </button>{mobile && !term && <button type="button" aria-label={`Remove ${person.name} from recent accounts`} data-ui-control="icon" data-control-size="md" data-control-variant="ghost" className="shrink-0" onClick={() => { forgetAccount(auth.user?.id, person.id); refreshRecent(value => value + 1); }}><XIcon aria-hidden="true" size={20} /></button>}</li>)}</ul>
      {term && current && result.status === 'ready' && !people.length ? <EmptyState title="No matching accounts" description="Try another name or username." /> : null}
      {mobile ? <div ref={footer} className="flow-root" style={currentPage?.status === 'done' ? { height: currentPage.height } : undefined}>
        {current && result.more ? <button ref={moreButton} type="button" aria-disabled={currentPage?.status === 'loading' || undefined} aria-busy={currentPage?.status === 'loading' || undefined} onClick={() => void loadMore()} className="mt-4 min-h-11 text-sm font-semibold text-[var(--accent-text)]">{currentPage?.status === 'loading' ? 'Loading…' : currentPage?.status === 'error' ? 'Retry' : 'Show more accounts'}</button> : null}
        {currentPage?.failed ? <p role="alert" className="mt-2 text-sm text-[var(--text-secondary)]">More accounts could not be loaded. Check your connection and try again.</p> : null}
        {currentPage?.status === 'loading' ? <span role="status" className="sr-only">Loading more accounts…</span> : null}
      </div> : current && result.more ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="mt-4 min-h-11 text-sm font-semibold text-[var(--accent-text)]">Show more accounts</button> : null}
    </div>
  </section>;
}
