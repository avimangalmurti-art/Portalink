import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from './ServicesContext';
import { toAuthError } from '../types/auth';
import type { AuthError, AuthIntent, AuthPhase, AuthSession, AuthUser, SignInInput } from '../types/auth';
import type { Id } from '../types/domain';

/**
 * The application's single session source of truth.
 *
 * Nothing else in the product may decide who is signed in: pages read
 * `useAuth()`, and ownership is derived from `viewerProfileId` rather than from
 * any hardcoded identity. Backend work happens behind `AuthService`, so this
 * provider only owns the state machine.
 */

/** Which sheet the auth surface should present, or null when it is closed. */
export type AuthView = 'signIn' | 'signUp' | 'forgotPassword' | 'resetPassword';
type AuthContextValue = {
  phase: AuthPhase;
  session: AuthSession | null;
  user: AuthUser | null;
  /** The profile this account owns. Null while signed out. */
  viewerProfileId: Id | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  /**
   * An authenticated account is not the same thing as a creator. This is true
   * only when the session exists AND owns a profile, so the UI can tell an
   * account still to set one up apart from a signed-out visitor.
   */
  hasCreatorProfile: boolean;
  /** Signed in, address confirmed, but no profile created yet. */
  needsProfileSetup: boolean;
  /** The session could not be read at all. `retryInitialize` re-reads it. */
  isSessionUnavailable: boolean;
  error: AuthError | null;
  clearError: () => void;
  /** Re-reads the session after a failed initialization. */
  retryInitialize: () => void;
  /**
   * Resolves with the committed session, so a caller never has to read
   * `viewerProfileId` from a render that has not happened yet. On success the
   * provider also closes the auth sheet; the pending destination survives.
   */
  signIn: (input: SignInInput) => Promise<AuthSession | null>;
  signOut: () => Promise<boolean>;
  /**
   * Links a newly created profile to this account. Called by the profile
   * feature after `ProfileService.createProfile` succeeds — never speculatively.
   */
  linkProfile: (profileId: Id) => Promise<void>;
  /** Which auth sheet is open, and the two ways to change that. */
  pendingView: AuthView | null;
  requestAuth: (view?: AuthView) => void;
  closeAuth: () => void;
  /**
   * The gate. A guest control asks for a destination rather than navigating,
   * and the destination is remembered independently of the sheet so cancelling
   * cannot bounce the person back into the same request.
   */
  requestAuthenticatedDestination: (intent: AuthIntent) => void;
  /** Why the sheet opened, when it opened because of a gated destination. */
  gateMessage: string | null;
  /** Reads the pending destination and clears it, so it resolves exactly once. */
  consumePendingIntent: () => AuthIntent | null;
  /**
   * The address last typed into any auth form, so moving between sign in, sign
   * up, and recovery — or returning after a failure — never asks for it twice.
   * Held in memory only: nothing is written to browser storage.
   */
  rememberedEmail: string;
  rememberEmail: (email: string) => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

/** One consistent sentence per gated destination — no paywall language. */
function describeIntent(intent: AuthIntent): string {
  switch (intent.kind) {
    case 'my-profile':
      return 'Sign in to open your profile and the rest of Portalink.';
    case 'view-profile':
      return 'Sign in to explore this creator and the rest of Portalink.';
    case 'view-portfolio':
      return 'Sign in to explore this portfolio and the rest of Portalink.';
    case 'studio':
      return 'Sign in to open Studio and the rest of Portalink.';
    case 'create-project':
      return 'Sign in to publish your work on Portalink.';
    case 'messages':
      return 'Sign in to message creators on Portalink.';
    case 'route':
      return `Sign in to ${intent.label} on Portalink.`;
    default:
      return `Sign in to ${intent.label} on Portalink.`;
  }
}
export function AuthProvider({
  children


}: {children: React.ReactNode;}) {
  const {
    auth
  } = useServices();
  const [phase, setPhase] = useState<AuthPhase>('initializing');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [pendingView, setPendingView] = useState<AuthView | null>(null);
  // Mirrors `pendingView` so callbacks can read it without re-creating.
  // A ref, not state: the destination is not rendered, and keeping it out of
  // render guarantees it cannot drive a re-request while the sheet is open.
  const pendingIntentRef = useRef<AuthIntent | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [initializeAttempt, setInitializeAttempt] = useState(0);
  const [rememberedEmail, setRememberedEmail] = useState('');
  // Restores focus to whatever opened the sheet once it closes.
  const openerRef = useRef<HTMLElement | null>(null);
  const isAuthenticated = phase === 'authenticated' && session !== null;
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;
  const pendingViewRef = useRef<AuthView | null>(null);
  // Guards against a second submit while a request is in flight.
  const isSigningInRef = useRef(false);
  useEffect(() => {
    let isCurrent = true;
    setPhase('initializing');
    const unsubscribe = auth.onAuthStateChange((next) => {
      if (!isCurrent) {
        return;
      }
      setSession(next);
      setPhase(next ? 'authenticated' : 'unauthenticated');
    });
    auth.getSession().then((next) => {
      if (!isCurrent) {
        return;
      }
      setSession(next);
      setPhase(next ? 'authenticated' : 'unauthenticated');
    }).catch((caught) => {
      if (!isCurrent) {
        return;
      }
      setError(toAuthError(caught));
      setPhase('failed');
    });
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [auth, initializeAttempt]);
  // Signing in is the product's landing surface: once the session has resolved
  // and nobody is signed in, the sheet presents itself rather than waiting to be
  // asked. It opens once per load, so dismissing it is respected and a later
  // sign-out does not re-present it on top of the person's work.
  const hasPresentedLandingRef = useRef(false);
  useEffect(() => {
    if (hasPresentedLandingRef.current || phase !== 'unauthenticated') {
      return;
    }
    hasPresentedLandingRef.current = true;
    pendingViewRef.current = 'signIn';
    setPendingView('signIn');
  }, [phase]);
  const signIn = useCallback(async (input: SignInInput): Promise<AuthSession | null> => {
    if (isSigningInRef.current) {
      // One request at a time: a second submit cannot race the first.
      return null;
    }
    isSigningInRef.current = true;
    setPhase('authenticating');
    setError(null);
    try {
      const next = await auth.signIn(input);
      // Committing the session and closing the sheet happen HERE, in the one
      // place that knows the attempt succeeded. The caller must not close the
      // sheet itself: `closeAuth` treats a close while still signed out as a
      // cancellation and drops the pending destination, and React has not
      // re-rendered yet at the moment an awaiting caller would run.
      isAuthenticatedRef.current = true;
      setSession(next);
      setPhase('authenticated');
      // Focus must not return to the Sign in button that no longer applies;
      // the destination view takes it instead.
      openerRef.current = null;
      setPendingView(null);
      setGateMessage(null);
      return next;
    } catch (caught) {
      setError(toAuthError(caught));
      // Still signed out — the attempt failed, nothing changed. The sheet stays
      // open on the form so the error is visible and can be corrected.
      setPhase('unauthenticated');
      return null;
    } finally {
      isSigningInRef.current = false;
    }
  }, [auth]);
  const signOut = useCallback(async () => {
    setPhase('signing-out');
    setError(null);
    try {
      await auth.signOut();
      setSession(null);
      setPhase('unauthenticated');
      // The address belonged to the session that just ended.
      setRememberedEmail('');
      return true;
    } catch (caught) {
      setError(toAuthError(caught));
      // Truthful: the session is still live, so the phase returns to it.
      setPhase('authenticated');
      return false;
    }
  }, [auth]);
  const linkProfile = useCallback(async (profileId: Id) => {
    const next = await auth.attachProfile(profileId);
    setSession(next);
    setPhase('authenticated');
  }, [auth]);
  const requestAuth = useCallback((view: AuthView = 'signIn') => {
    // Switching between sheets keeps the gate's wording; opening the sheet
    // directly (from Account settings, say) has no destination to explain.
    if (pendingViewRef.current === null) {
      setGateMessage(null);
    }
    setPendingView(view);
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(null);
  }, []);
  const requestAuthenticatedDestination = useCallback((intent: AuthIntent) => {
    pendingIntentRef.current = intent;
    setGateMessage(describeIntent(intent));
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError(null);
    setPendingView('signIn');
  }, []);
  const consumePendingIntent = useCallback(() => {
    const taken = pendingIntentRef.current;
    pendingIntentRef.current = null;
    return taken;
  }, []);
  const closeAuth = useCallback(() => {
    setPendingView(null);
    setGateMessage(null);
    setError(null);
    // Cancelling abandons the destination, so the guest stays exactly where
    // they were and nothing can reopen the sheet. After a successful sign-in
    // the session already exists, and the intent survives to be fulfilled once.
    if (!isAuthenticatedRef.current) {
      pendingIntentRef.current = null;
    }
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    phase,
    session,
    user: session?.user ?? null,
    viewerProfileId: session?.user.profileId ? session.user.profileId : null,
    isAuthenticated,
    isInitializing: phase === 'initializing',
    hasCreatorProfile: isAuthenticated && Boolean(session?.user.profileId),
    needsProfileSetup: isAuthenticated && Boolean(session?.user.isEmailVerified) && !session?.user.profileId,
    isSessionUnavailable: phase === 'failed',
    error,
    clearError: () => setError(null),
    retryInitialize: () => setInitializeAttempt((attempt) => attempt + 1),
    signIn,
    signOut,
    linkProfile,
    pendingView,
    requestAuth,
    closeAuth,
    requestAuthenticatedDestination,
    gateMessage,
    consumePendingIntent,
    rememberedEmail,
    rememberEmail: setRememberedEmail
  }), [phase, session, isAuthenticated, error, signIn, signOut, linkProfile, pendingView, gateMessage, requestAuth, closeAuth, requestAuthenticatedDestination, consumePendingIntent, rememberedEmail]);
  pendingViewRef.current = pendingView;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return value;
}
