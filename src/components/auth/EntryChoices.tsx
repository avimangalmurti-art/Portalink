import React, { useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { readSharedReturnPath } from '../../features/auth/registration';
import './oneScreenEntry.css';
import { EntryAgreements, EntryLegal } from './EntryAgreements';
import { usePresentation, type Presentation } from '../../presentation/usePresentation';

export function EntryChoices({ ready = true, onEmail, onSignIn, children, returnPath, onDisagree, presentation, hideProviders = true }: {
  ready?: boolean; onEmail?: () => void; onSignIn: () => void;
  children?: React.ReactNode; returnPath?: string; onDisagree?: () => void; presentation?: Presentation; hideProviders?: boolean;
}) {
  const contextualPresentation = usePresentation();
  // The opening scene precedes the app host and already knows its presentation.
  const mobile = (presentation ?? contextualPresentation) === 'mobile';
  const { auth: service } = useServices();
  const auth = useAuth();
  const [providers, setProviders] = useState<{ google: boolean; apple: boolean } | null>(null);
  const [error, setError] = useState<string | null>(() => new URLSearchParams(window.location.search).get('entry') === 'oauth'
    && [window.location.search, window.location.hash].some(part => new URLSearchParams(part.slice(1)).has('error'))
    ? 'Sign in was cancelled or could not be completed. Try again or continue with email.' : null);
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  useEffect(() => {
    let current = true;
    if (!service.getSocialProviders) setProviders({google:false,apple:false});
    void service.getSocialProviders?.().then(value => { if (current) setProviders(value); })
      .catch(() => { if (current) setError('Sign-in options could not be checked. You can continue with email.'); });
    return () => { current = false; };
  }, [service]);
  async function social(provider: 'google' | 'apple') {
    if (starting.current || !ready || !providers?.[provider] || !service.signInWithOAuth) return;
    starting.current = true; setBusy(true); setError(null);
    try {
      const intent = auth.peekPendingIntent();
      await service.signInWithOAuth(provider, readSharedReturnPath(intent?.kind === 'route' ? intent.path : returnPath));
    } catch {
      setError('Sign in could not be started. Please try again or continue with email.');
    } finally { starting.current = false; setBusy(false); }
  }
  const emailButton = onEmail && <button className="entry-email" type="button" disabled={!ready || busy} onClick={onEmail}>Continue with email</button>;
  return <EntryAgreements onDisagree={onDisagree ?? (() => undefined)}>{agreements => <div className="one-screen-entry">
    {mobile && emailButton}
    {!hideProviders && <div className="entry-providers" aria-label="Sign-in options">
      {(['google', 'apple'] as const).map(provider => {
        // Apple remains unavailable until its separately held setup is approved.
        const available = provider === 'google' && Boolean(providers?.google);
        return <div className="entry-provider" key={provider}>
          <button type="button" disabled={!ready || busy || !available}
            onClick={() => void agreements.request().then(agreed => { if (agreed) return social(provider); })}
            aria-describedby={!available ? `entry-${provider}-availability` : undefined}>
            Continue with {provider === 'google' ? 'Google' : 'Apple'}
          </button>
          {!available && <p className="entry-availability" id={`entry-${provider}-availability`}>
            {provider === 'google' ? 'Google' : 'Apple'} sign-in is not available yet.
          </p>}
        </div>;
      })}
    </div>}
    {!hideProviders && error && <p role="alert">{error}</p>}
    {!mobile && emailButton}
    {children}
    <div className="entry-links">
      <button type="button" disabled={!ready || busy} onClick={onSignIn}>Already have an account? Sign in</button>
    </div>
    <EntryLegal />
  </div>}</EntryAgreements>;
}
