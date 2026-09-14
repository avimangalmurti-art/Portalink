import React, { useState } from 'react';
import type { LiveSession } from '../types/domain';
import { placeLabelFor } from '../data/liveSessions';
import type { LiveSessionsState } from '../features/live/useLiveSessions';
import { ModalPortal } from './ui/ModalPortal';

/**
 * A thin broadcast crawl along the bottom edge of the globe screen. Selecting a
 * station asks whether to join its live session.
 *
 * Purely presentational: it calls no service. Sessions and the join lifecycle come
 * from `useLiveSessions`. It used to hold its own hardcoded station list and hand a
 * display string upward, which is why a "joined" session had no id behind it.
 */
type BroadcastTickerProps = {
  live: LiveSessionsState;
};
function TickerRun({
  sessions,
  onSelect



}: {sessions: LiveSession[];onSelect: (session: LiveSession) => void;}) {
  return <>
      {sessions.map((session) => <button key={session.id} type="button" onClick={() => onSelect(session)} className="px-6 text-small font-medium uppercase tracking-[0.06em] transition-opacity hover:opacity-70 focus:outline-none">
          ● {session.isLive ? 'LIVE' : 'Coming up'} — {session.hostName}, “{session.title}” — {placeLabelFor(session.locationId)}
        </button>)}
    </>;
}
export function BroadcastTicker({
  live
}: BroadcastTickerProps) {
  const [pending, setPending] = useState<LiveSession | null>(null);
  const isJoining = Boolean(pending) && live.joinPhase === 'joining';
  const failure = live.joinPhase === 'error' ? live.joinError : null;
  return <>
      

      {pending && <ModalPortal><div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isJoining) {
        setPending(null);
      }
    }}>
          <div data-material="content" role="dialog" aria-modal="true" aria-label="Join the radio show" className="portalink-ticker-text shape-container w-full max-w-[380px] border border-[color:color-mix(in_srgb,var(--live-accent)_40%,transparent)] bg-black p-5">
            <h2 className="text-medium font-bold uppercase tracking-[0.06em]">Join the radio show</h2>
            <p className="mt-2 text-small uppercase tracking-[0.06em] opacity-80">
              {pending.hostName}, “{pending.title}” — {placeLabelFor(pending.locationId)}
            </p>
            {/* Said before joining, in the service's own words: there is no audio
             and membership does not survive a reload. */}
            {live.capability?.reason && !live.capability.isRealtime && <p className="mt-2.5 text-[11px] leading-[1.5] uppercase tracking-[0.04em] opacity-60">{live.capability.reason}</p>}
            {failure && <p role="alert" className="mt-2.5 text-[11px] leading-[1.5] uppercase tracking-[0.04em] opacity-80">
                {failure}
                {live.retry && <button type="button" onClick={live.retry} className="ml-1.5 font-bold underline focus:outline-none">Try again</button>}
              </p>}
            <div className="mt-5 flex gap-2">
              {/* Joined only once the service has confirmed it. */}
              <button type="button" disabled={isJoining} aria-busy={isJoining || undefined} onClick={() => {
            live.join(pending.id);
            setPending(null);
          }} className="shape-capsule flex h-10 flex-1 items-center justify-center border border-[var(--live-accent)] text-small font-bold uppercase tracking-[0.06em] transition-colors hover:bg-[color:color-mix(in_srgb,var(--live-accent)_15%,transparent)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                {isJoining ? 'Joining…' : 'Yes'}
              </button>
              <button type="button" disabled={isJoining} onClick={() => setPending(null)} className="shape-capsule flex h-10 flex-1 items-center justify-center border border-[color:color-mix(in_srgb,var(--live-accent)_30%,transparent)] text-small font-bold uppercase tracking-[0.06em] opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                No
              </button>
            </div>
          </div>
        </div></ModalPortal>}
    </>;
}
