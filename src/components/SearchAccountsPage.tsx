import React, { useEffect, useRef, useState } from 'react';
import { useServices } from '../contexts/ServicesContext';
import type { FeedCreator } from '../types/domain';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { EmptyState, ErrorState, LoadingState } from './ui/StateViews';
import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';

export function SearchAccountsPage({ query, onQueryChange, onOpenCreator, onWarmCreator, onBack }: {
  query: string; onQueryChange: (value: string) => void; onOpenCreator: (id: string) => void; onWarmCreator?: (id: string) => void; onBack?: () => void;
}) {
  const { discovery } = useServices();
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
  return <section className="flex h-full min-h-0 flex-col px-5 py-5" aria-label="Account search">
    {onBack ? <ScreenBack visibleOnMobile action={onBack}><button type="button" className="mb-3 min-h-11 self-start text-sm font-semibold" onClick={onBack}>Back</button></ScreenBack> : null}
    <h1 className="mb-4 text-xl font-semibold">Search accounts</h1>
    <label className="mb-4 block"><span className="sr-only">Name or username</span><input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Name or username" className="min-h-11 w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface-sunken)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" maxLength={80} /></label>
    <div className="min-h-0 flex-1 overflow-y-auto pb-24">
      {!term ? <p className="text-sm text-[var(--text-secondary)]">Find someone by name or username.</p> : null}
      {loading ? <LoadingState label="Searching accounts…" /> : null}
      {current && result.status === 'error' ? <ErrorState title="Accounts could not be searched" description="Check your connection and try again." onRetry={() => setAttempt(value => value + 1)} /> : null}
      <ul className="inset-row-group inset-row-group-icons">{people.map(person => <li key={person.id}><button type="button" className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => onOpenCreator(person.id)} onPointerEnter={() => onWarmCreator?.(person.id)} onFocus={() => onWarmCreator?.(person.id)}>
        <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl"><CreatorAvatar name={person.name} avatar={person.avatar} className="h-full w-full" /></span>
        <span className="min-w-0"><strong className="block truncate">{person.name}</strong><span className="block truncate text-sm text-[var(--text-secondary)]">{person.kind}</span>{person.location ? <span className="block truncate text-sm text-[var(--text-secondary)]">{person.location}</span> : null}</span>
      </button></li>)}</ul>
      {term && current && result.status === 'ready' && !people.length ? <EmptyState title="No matching accounts" description="Try another name or username." /> : null}
      {current && result.more ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="mt-4 min-h-11 text-sm font-semibold text-[var(--accent-text)]">Show more accounts</button> : null}
    </div>
  </section>;
}
