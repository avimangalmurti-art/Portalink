import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useAccountQuery } from './useAccountQuery';

export function CreatorSaveButton({ profileId, name }: { profileId: string; name: string }) {
  const auth = useAuth();
  if (auth.viewerProfileId === profileId) return null;
  return <CreatorSaveControl key={`${auth.user?.id ?? 'guest'}:${profileId}`} profileId={profileId} name={name} />;
}

function CreatorSaveControl({ profileId, name }: { profileId: string; name: string }) {
  const auth = useAuth();
  const { creatorSaves: service } = useServices();
  const query = useCallback(() => service.getCreatorSave(profileId), [service, profileId]);
  const state = useAccountQuery(query);
  const [saved, setSaved] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isSaved = saved ?? state.data ?? false;
  async function toggle() {
    if (!auth.isAuthenticated) { auth.requestAuth('signIn'); return; }
    if (state.error) { state.retry(); return; }
    if (busy.current || state.loading) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      const next = await service.setCreatorSave(profileId, !isSaved);
      if (mounted.current) setSaved(next);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : 'Unable to save creator.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const label = state.error ? 'Retry loading creator bookmark' : isSaved ? `Unsave ${name}` : `Save ${name}`;
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" onClick={() => void toggle()} aria-label={label} title={isSaved ? 'Saved creator · private' : 'Save creator privately, without following'} aria-pressed={isSaved} aria-busy={pending || state.loading} disabled={pending || state.loading} className="side-panel-compact-control shape-compact inline-flex items-center justify-center border border-[var(--hairline-strong)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
      <InterfaceIcon icon={BookmarkIcon} size="sm" keepColor style={{ color: 'var(--engagement-save-selected)' }} fill={isSaved ? 'currentColor' : 'none'} />
    </button>
    {(error || state.error) && <span role="alert" className="max-w-[200px] text-[11px] text-[var(--status-danger)]">{error ?? state.error}</span>}
    <span className="sr-only" aria-live="polite">{saved === undefined ? '' : saved ? 'Creator saved privately.' : 'Creator removed from Saved.'}</span>
  </span>;
}
