import React from 'react';
import './route-error.css';

export type RouteErrorKind = 'not-found' | 'no-access' | 'expired' | 'network';
const messages: Record<RouteErrorKind, [string, string]> = {
  'not-found': ['Page not found', 'This page may have been moved or removed.'],
  'no-access': ['No access', 'This page is not available to you.'],
  expired: ['Link expired', 'This link is no longer available.'],
  network: ['Connection unavailable', 'This page could not be loaded.'],
};
/** Only classified service failures reveal access/expiry; unknown IDs stay indistinguishable. */
export function routeErrorKind(message: string | null | undefined): RouteErrorKind {
  if (/expired/i.test(message ?? '')) return 'expired';
  if (/no access|access denied|forbidden/i.test(message ?? '')) return 'no-access';
  if (/not found|could not be found/i.test(message ?? '')) return 'not-found';
  return 'network';
}
/** Lives in the caller's existing shell. Navigation and dock remain shell-owned. */
export function RouteError({ kind, creatorHandle, onBack, onHome, onCreator }: {
  kind: RouteErrorKind; creatorHandle?: string | null;
  onBack: () => void; onHome: () => void; onCreator?: () => void;
}) {
  const [title, explanation] = messages[kind];
  return <section className="route-error" data-error-kind={kind} aria-label={title}>
    <header><button type="button" aria-label="Back" onClick={onBack}>‹</button></header>
    <div className="route-error-card" role="alert"><h1>{title}</h1><p>{explanation}</p></div>
    <button type="button" className="route-error-pill" onClick={() => { if(creatorHandle && onCreator)onCreator();else onHome(); }}>
      {creatorHandle && onCreator ? 'Open the creator’s profile' : 'Go to Home'}
    </button>
  </section>;
}
