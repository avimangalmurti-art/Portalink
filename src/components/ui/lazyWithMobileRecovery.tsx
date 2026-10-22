import React, { useContext } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import { DeferredSurfaceStatus } from './DeferredDialog';
import { DeferredSurfaceOwnerContext } from './DeferredSurfaceOwner';
import { isModuleDownloadFailure, recoverModuleStyles } from './moduleLoadRecovery';

class ModuleDownloadError extends Error {
  constructor(readonly owner: object, readonly original: unknown) {
    super('A screen module could not be downloaded.');
  }
}

type Module<Props> = { default: React.ComponentType<Props> };
type RecoveryProps<Props> = {
  componentProps: Props;
  mobile: boolean;
  active: boolean;
  allowed: boolean;
  accountId: string | null;
  phase: string;
  session: object;
  onClose: () => void;
};
type RecoveryState<Props> = {
  failure: ModuleDownloadError | null;
  recovered: React.ComponentType<Props> | null;
  fatal: { error: unknown } | null;
};

/**
 * Recovery belongs to this import, never to the healthy screen surrounding it.
 * Successful component identities are permanent, including when another copy
 * of the same screen recovers or the presentation changes.
 */
export function lazyWithMobileRecovery<Props extends object>(loader: () => Promise<Module<Props>>): React.ComponentType<Props> {
  // Reopening an already downloaded screen must retain React.lazy's original
  // fulfilled-cache behavior, without changing any existing instance's type.
  let fulfilled: React.ComponentType<Props> | null = null;
  const owner = {};
  let initialLoading = false;
  // This identity must survive an initially suspended, uncommitted class being
  // discarded. Creating lazy in its constructor would retry that import on
  // every Suspense render, before any local failure could be committed.
  const Initial = React.lazy(() => {
    initialLoading = true;
    return loader().then(loaded => {
      fulfilled = loaded.default;
      initialLoading = false;
      return loaded;
    }, error => {
      initialLoading = false;
      if (isModuleDownloadFailure(error)) throw new ModuleDownloadError(owner, error);
      throw error;
    });
  });
  class ModuleBoundary extends React.Component<RecoveryProps<Props>, RecoveryState<Props>> {
    state: RecoveryState<Props> = { failure: null, recovered: null, fatal: null };
    private Initial = fulfilled ?? Initial;
    private mounted = false;
    private listening = false;
    private wasHidden = false;
    private wasOffline = false;
    private grant = false;
    private scheduled = false;
    private attempt: { controller: AbortController } | null = null;

    static getDerivedStateFromError(error: unknown) {
      // A nested module or an error thrown by already mounted product code is
      // not ours. Its existing boundary retains ownership of that failure.
      if (!(error instanceof ModuleDownloadError)) throw error;
      return { failure: error };
    }

    componentDidMount() {
      this.mounted = true;
      this.syncListeners();
    }

    componentDidUpdate(previous: RecoveryProps<Props>) {
      const sameScope = previous.accountId === this.props.accountId && previous.session === this.props.session && previous.phase === this.props.phase;
      if (!sameScope
        || !this.props.mobile || !this.props.active || !this.props.allowed) this.cancel();
      this.syncListeners();
      // Back to a retained failed screen, or an explicit dialog reopen, is a
      // user return. A resize or replacement account is not such a request.
      if (sameScope && previous.mobile && this.props.mobile && previous.allowed && this.props.allowed
        && !previous.active && this.props.active) this.allowAttempt();
      if (this.state.failure && this.grant) this.schedule();
    }

    componentWillUnmount() {
      this.mounted = false;
      this.cancel();
      this.syncListeners();
    }

    private syncListeners = () => {
      const listen = this.mounted && this.props.mobile && this.props.active && this.props.allowed;
      if (listen === this.listening) return;
      this.listening = listen;
      if (listen) {
        this.wasHidden = document.visibilityState !== 'visible';
        this.wasOffline = navigator.onLine === false;
        window.addEventListener('offline', this.offline);
        window.addEventListener('online', this.online);
        document.addEventListener('visibilitychange', this.visibility);
      } else {
        window.removeEventListener('offline', this.offline);
        window.removeEventListener('online', this.online);
        document.removeEventListener('visibilitychange', this.visibility);
      }
    };

    private eligible = () => this.mounted && this.props.mobile && this.props.active && this.props.allowed
      && document.visibilityState === 'visible' && navigator.onLine !== false;

    private cancel = () => {
      this.grant = false;
      this.attempt?.controller.abort();
      this.attempt = null;
    };

    private offline = () => { this.wasOffline = true; };
    private online = () => {
      const returned = this.wasOffline;
      this.wasOffline = navigator.onLine === false;
      if (returned && !this.wasOffline) this.allowAttempt();
    };
    private visibility = () => {
      const visible = document.visibilityState === 'visible';
      const returned = visible && this.wasHidden;
      this.wasHidden = !visible;
      // Keep the shared static stylesheet request alive in the background.
      // Eligibility still prevents a hidden page from mounting recovered UI.
      if (!visible) return;
      if (returned) this.allowAttempt();
    };

    private allowAttempt = () => {
      if (!this.eligible() || (!this.state.failure && !initialLoading) || (this.state.failure && this.state.failure.owner !== owner)) return;
      // Distinct foreground/reconnection cycles can grant another attempt,
      // but duplicate notifications in one turn cannot create parallel work.
      this.grant = true;
      this.schedule();
    };

    private schedule = () => {
      if (this.scheduled) return;
      this.scheduled = true;
      void Promise.resolve().then(() => {
        this.scheduled = false;
        if (!this.grant || this.attempt || !this.state.failure || this.state.failure.owner !== owner || !this.eligible()) return;
        this.grant = false;
        void this.retry();
      });
    };

    private async retry() {
      const failure = this.state.failure;
      if (!failure) return;
      const attempt = { controller: new AbortController() };
      const scope = { accountId: this.props.accountId, session: this.props.session, phase: this.props.phase };
      this.attempt = attempt;
      let repairingStyles = true;
      const current = () => this.attempt === attempt && !attempt.controller.signal.aborted && this.eligible()
        && scope.accountId === this.props.accountId && scope.session === this.props.session && scope.phase === this.props.phase;
      try {
        // Vite remembers failed CSS preloads separately from React's rejected
        // lazy type. Both the stylesheet and module must succeed first.
        await recoverModuleStyles(failure.original, attempt.controller.signal);
        if (!current()) return;
        repairingStyles = false;
        const loaded = await loader();
        fulfilled = loaded.default;
        if (!current()) return;
        this.grant = false;
        // The import has fulfilled; rendering its real type avoids suspending
        // a healthy enclosing profile/reader again for an already loaded file.
        this.setState({ failure: null, recovered: loaded.default, fatal: null });
      } catch (error) {
        if (!current()) return;
        if (repairingStyles) this.setState({ failure });
        else if (isModuleDownloadFailure(error)) this.setState({ failure: new ModuleDownloadError(owner, error) });
        else this.setState({ fatal: { error } });
      } finally {
        if (this.attempt === attempt) {
          this.attempt = null;
          if (this.grant) this.schedule();
        }
      }
    }

    render() {
      if (this.state.fatal) throw this.state.fatal.error;
      if (this.state.failure) {
        if (this.state.failure.owner !== owner) throw this.state.failure;
        if (!this.props.mobile) throw this.state.failure.original;
        return this.props.active ? <DeferredSurfaceStatus failed onClose={this.props.onClose} /> : null;
      }
      const Child = this.state.recovered ?? this.Initial;
      return React.createElement(Child as React.ComponentType<Props>, this.props.componentProps);
    }
  }

  return function MobileRecoverableModule(componentProps: Props) {
    const auth = useAuth();
    const mobile = usePresentation() === 'mobile';
    const screenActive = useMobileScreenActive();
    const surface = useContext(DeferredSurfaceOwnerContext);
    const callback = typeof window !== 'undefined' && /[?#&](?:auth|code|token|access_token|refresh_token|provider_token|provider_refresh_token|token_hash|type|error|error_code|error_description)=/i.test(window.location.search + window.location.hash);
    const allowed = (auth.phase === 'authenticated' || auth.phase === 'unauthenticated')
      && !auth.pendingView && !auth.session?.isPasswordRecovery && !callback;
    return <ModuleBoundary componentProps={componentProps} mobile={mobile} active={screenActive && surface.active} allowed={allowed}
      accountId={auth.user?.id ?? null} phase={auth.phase} session={auth.loginSession} onClose={surface.onClose} />;
  };
}
