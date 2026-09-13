import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import type { BlockedPerson } from '../../types/messages';

export function BlockedPeopleSection() {
  const { messaging } = useServices();
  const { viewerProfileId } = useAuth();
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const version = useRef(0);
  const busy = useRef(false);
  const currentViewer = useRef(viewerProfileId);
  currentViewer.current = viewerProfileId;
  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true); setError(null);
    try {
      const next = await messaging.listBlockedPeople();
      if (request === version.current && currentViewer.current === viewerProfileId) setPeople(next);
    } catch {
      if (request === version.current && currentViewer.current === viewerProfileId) setError('Blocked people could not be loaded. Try again.');
    } finally {
      if (request === version.current && currentViewer.current === viewerProfileId) setLoading(false);
    }
  }, [messaging, viewerProfileId]);
  useEffect(() => { const generation = version; setPeople([]); setPending(null); setAnnouncement(''); void load(); return () => { generation.current++; }; }, [load]);
  async function unblock(person: BlockedPerson, trigger: HTMLButtonElement) {
    if (busy.current || !viewerProfileId) return;
    busy.current = true;
    const request = version.current;
    setPending(person.id); setError(null);
    try {
      await messaging.unblockParticipant(person.id);
      if (request !== version.current || currentViewer.current !== viewerProfileId) return;
      if (document.activeElement === trigger || document.activeElement === document.body) headingRef.current?.focus({ preventScroll: true });
      setPeople(current => current.filter(item => item.id !== person.id));
      setAnnouncement(`${person.name} unblocked.`);
    } catch {
      if (request === version.current && currentViewer.current === viewerProfileId) setError('This person could not be unblocked. Please try again.');
    } finally {
      busy.current = false;
      if (request === version.current && currentViewer.current === viewerProfileId) setPending(null);
    }
  }
  return <section aria-labelledby="blocked-people-heading" className="mt-5 border-t border-[var(--hairline)] pt-5">
    <h3 ref={headingRef} tabIndex={-1} id="blocked-people-heading" className="text-[15px] font-semibold">Blocked people</h3>
    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">Unblocking allows contact according to your message settings. Archived conversations stay archived.</p>
    <p role="status" className={loading ? 'mt-3 text-sm' : 'sr-only'}>{loading ? 'Loading blocked people…' : announcement}</p>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--status-danger)]">{error} {!people.length && <button type="button" className="rounded-lg p-2 underline" onClick={() => void load()}>Try again</button>}</p>}
    {!loading && !error && !people.length && <p className="mt-3 text-sm text-[var(--text-secondary)]">You haven’t blocked anyone.</p>}
    <ul className="mt-3 space-y-2">{people.map(person => <li key={person.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-2">
      <div className="min-w-0 flex-1 break-words text-sm"><span className="font-medium">{person.name}</span>{person.handle && <span className="block text-[var(--text-secondary)]">@{person.handle}</span>}</div>
      <button type="button" disabled={pending !== null} onClick={event => void unblock(person, event.currentTarget)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{pending === person.id ? 'Unblocking…' : 'Unblock'}</button>
    </li>)}</ul>
  </section>;
}
