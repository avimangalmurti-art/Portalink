import { useAuth } from '../contexts/AuthContext';
import { readRecentAccounts, rememberAccount, forgetAccount } from '../features/follows/recentAccounts';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, XIcon } from 'lucide-react';
import { useServices } from '../contexts/ServicesContext';
import type { FeedCreator } from '../types/domain';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';
import { usePresentation } from '../presentation/usePresentation';
import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';

export function SearchAccountsPage({ query, onQueryChange, onOpenCreator, onWarmCreator, onBack }: {
  query: string; onQueryChange: (value: string) => void; onOpenCreator: (id: string) => void; onWarmCreator?: (id: string) => void; onBack?: () => void;
}) {
  const mobile = usePresentation() === 'mobile';
  const SearchField = mobile ? 'textarea' : 'input';
  const { discovery } = useServices();
  const auth = useAuth();
  const [, refreshRecent] = useState(0);
  const recent = readRecentAccounts(auth.user?.id);
  const term = query.trim();
  const request = useRef(0);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ term: string; people: FeedCreator[]; status: 'loading' | 'ready' | 'error'; more: boolean }>({ term: '', people: [], status: 'ready', more: false });
  useEffect(() => {
    const version = ++request.current;
    busy.current = false;
    setResult({ term, people: [], status: term ? 'loading' : 'ready', more: false });
    if (!term) return;
    const timer = window.setTimeout(() => {
      void (discovery.searchAccounts ? discovery.searchAccounts(term) : Promise.reject(new Error('Search unavailable'))).then(people => {
        if (request.current === version) setResult({ term, people, status: 'ready', more: people.length === 30 });
      }).catch(() => {
        if (request.current === version) setResult({ term, people: [], status: 'error', more: false });
      });
    }, 220);
    return () => { window.clearTimeout(timer); request.current++; };
  }, [term, discovery, attempt]);
  const current = result.term === term;
  const people = current ? result.people : [];
  const loading = Boolean(term) && (!current || result.status === 'loading');
  async function loadMore() {
    if (!current || busy.current || !result.more || !discovery.searchAccounts) return;
    const version = request.current;
    busy.current = true;
    setResult(value => ({ ...value, status: 'loading' }));
    try {
      const next = await discovery.searchAccounts(term, people.length);
      if (request.current === version) setResult({ term, people: [...people, ...next], status: 'ready', more: next.length === 30 });
    } catch {
      if (request.current === version) setResult(value => ({ ...value, status: 'error' }));
    } finally { if (request.current === version) busy.current = false; }
  }
  return <section data-account-search className="flex h-full min-h-0 flex-col px-5 py-5" aria-label="Search">
    <header className="account-search-header contents">
    {onBack ? <ScreenBack visibleOnMobile action={onBack}><button type="button" aria-label="Back" className="account-search-back mb-3 flex h-11 w-11 shrink-0 items-center justify-center self-start" onClick={onBack}><ArrowLeftIcon aria-hidden="true" size={24} /></button></ScreenBack> : null}
    <h1 className="mb-4 text-xl font-semibold">Search</h1>
    <label className="mb-4 block"><span className="sr-only">Search accounts</span><SearchField {...(mobile ? { rows: 1, wrap: 'off', role: 'searchbox' } : { type: 'search' })} name="account-search-query" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onQueryChange(mobile ? event.target.value.replace(/[\r\n]+/g, ' ') : event.target.value)} onKeyDown={event => { if (mobile && event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault(); }} placeholder={mobile ? 'Search accounts' : 'Search by name or handle'} className={`min-h-11 w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]${mobile ? ' block h-11 resize-none overflow-x-auto whitespace-nowrap' : ''}`} maxLength={80} /></label>
    </header>
    <div className="account-search-results min-h-0 flex-1 overflow-y-auto pb-24">
      {!term && !recent.length && <p className="py-5 text-sm text-[var(--text-secondary)]">Search by name or handle.</p>}

      {loading ? <LoadingState label="Searching accounts…" /> : null}
      {current && result.status === 'error' ? <ErrorState title="Accounts could not be searched" description="Check your connection and try again." onRetry={() => setAttempt(value => value + 1)} /> : null}
      <ul aria-label={term ? "Search results" : "Recent accounts"} className="inset-row-group inset-row-group-icons account-search-list">{(term ? people : recent).map(person => <li key={person.id} className={mobile ? "flex items-center" : undefined}><button type="button" className={`flex min-h-16 ${mobile ? 'min-w-0 flex-1' : 'w-full'} items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`} onClick={() => { rememberAccount(auth.user?.id, person); onOpenCreator(person.id); }} onPointerEnter={() => onWarmCreator?.(person.id)} onFocus={() => onWarmCreator?.(person.id)}>
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl"><CreatorAvatar name={person.name} avatar={person.avatar} className="h-full w-full" /></span>
        <span className="min-w-0"><strong className="block truncate">{person.name}</strong><span className="block truncate text-sm text-[var(--text-secondary)]">{person.kind}</span>{person.location ? <span className="block truncate text-sm text-[var(--text-secondary)]">{person.location}</span> : null}</span>
      </button>{mobile && !term && <button type="button" aria-label={`Remove ${person.name} from recent accounts`} data-ui-control="icon" data-control-size="md" data-control-variant="ghost" className="shrink-0" onClick={() => { forgetAccount(auth.user?.id, person.id); refreshRecent(value => value + 1); }}><XIcon aria-hidden="true" size={20} /></button>}</li>)}</ul>
      {term && current && result.status === 'ready' && !people.length ? <EmptyState title="No matching accounts" description="Try another name or username." /> : null}
      {current && result.more ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="mt-4 min-h-11 text-sm font-semibold text-[var(--accent-text)]">Show more accounts</button> : null}
    </div>
  </section>;
}
