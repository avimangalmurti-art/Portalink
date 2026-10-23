import { dismissTopModal } from '../../hooks/useModalFocus';

export type ProfileLeaveGuardOptions = {
  enabled: boolean;
  blocked: boolean;
  onRequestDiscard: () => void;
  /** Native Back inside a child cancels only that child transaction. */
  onChildBack?: () => void;
};
type Browser = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
type Entry = { index: number; key: unknown; href: string };
type Restoration = { latestIndex: number; inFlight: boolean; retries: number; task?: number; watchdog?: number };
const owners = new Set<ProfileLeaveGuardController>();
type PopHandler = (event: PopStateEvent) => boolean;
const nativeDispatchers = new WeakMap<Browser, Set<PopHandler>>();
function nativePopHandlers(browser: Browser): Set<PopHandler> {
  let handlers = nativeDispatchers.get(browser);
  if (!handlers) {
    handlers = new Set();
    nativeDispatchers.set(browser, handlers);
    const current = handlers;
    // Installed before BrowserRouter mounts: a later per-screen listener can
    // lose to Router synchronously unmounting that screen during Window POP.
    browser.addEventListener('popstate', event => {
      for (const handle of [...current].reverse()) if (handle(event)) break;
    }, true);
  }
  return handlers;
}
let replayDepth = 0;
const indexFrom = (state: unknown): number | null => {
  const value = state && typeof state === 'object' && 'idx' in state ? state.idx : null;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
};

/** The navigation adapter remains unchanged unless a dirty profile owns a guard. */
export function interceptProfileNavigation(action: () => void): boolean {
  if (replayDepth) return false;
  for (const owner of [...owners].reverse()) if (owner.intercept(action)) return true;
  return false;
}

/** A temporary owner of existing history, never a new history entry or draft store. */
export class ProfileLeaveGuardController {
  private options: ProfileLeaveGuardOptions = { enabled: false, blocked: false, onRequestDiscard: () => undefined };
  private attached = false;
  private origin: Entry | null = null;
  private pending: (() => void) | null = null;
  private confirmed = false;
  private restoring: Restoration | null = null;
  private replayTask: number | undefined;
  private approvedPop = false;
  private approvalTimer: number | undefined;
  private nativeBackDelta: number | null = null;
  private nativeBackTask: number | undefined;
  private nativeBackHadChild = false;
  private nativeBackEpoch = 0;
  private leaveEpoch = 0;

  constructor(private readonly browser: Browser, private readonly dismissModal: () => unknown = dismissTopModal) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    owners.add(this);
    nativePopHandlers(this.browser).add(this.onPop);
    this.browser.addEventListener('beforeunload', this.onBeforeUnload);
    if (this.options.enabled || this.options.onChildBack) this.captureOrigin();
  }

  detach(): void {
    this.attached = false;
    owners.delete(this);
    nativeDispatchers.get(this.browser)?.delete(this.onPop);
    this.browser.removeEventListener('beforeunload', this.onBeforeUnload);
    this.clearPending();
    this.clearRestoration();
    this.clearApproval();
    this.clearNativeBack();
    this.origin = null;
  }

  update(options: ProfileLeaveGuardOptions): void {
    const wasEnabled = this.options.enabled;
    const wasWatching = wasEnabled || Boolean(this.options.onChildBack);
    this.options = options;
    const watching = options.enabled || Boolean(options.onChildBack);
    if (!watching) this.clearNativeBack();
    if (!options.enabled) {
      if (wasEnabled) this.clearPending();
      this.clearApproval();
      // A swallowed pop must first return to Router's still-mounted location.
      if (!watching && !this.restoring) this.origin = null;
    }
    if (watching && !wasWatching && this.attached && !this.restoring) this.captureOrigin();
  }

  /** Return true only when this active owner consumed the navigation. */
  intercept(action: () => void): boolean {
    if (!this.attached || (!this.options.enabled && !this.restoring)) return false;
    this.requestLeave(action);
    return true;
  }

  requestLeave(action: () => void): void {
    if (!this.attached || this.options.blocked || this.approvedPop) return;
    if (!this.options.enabled) {
      // A confirmed Save may finish while a refused Back is still returning.
      // Complete that compensation before replaying its ordinary return.
      if (this.restoring) { this.pending = action; this.confirmed = true; }
      else action();
      return;
    }
    if (this.pending) return;
    this.pending = action;
    this.options.onRequestDiscard();
  }

  confirmLeave(): void {
    if (!this.attached || !this.options.enabled || this.options.blocked || !this.pending) return;
    this.confirmed = true;
    if (!this.restoring) this.replay();
    else if (this.restoring.retries > 2) { this.restoring.retries = 0; this.scheduleRestoration(); }
  }

  cancelLeave(): void { this.leaveEpoch++; this.clearPending(); }

  private captureOrigin(): void {
    const state: unknown = this.browser.history.state;
    const index = indexFrom(state);
    this.origin = index === null ? null : { index, key: state && typeof state === 'object' && 'key' in state ? state.key : undefined, href: this.browser.location.href };
  }

  private atOrigin(): boolean {
    const state: unknown = this.browser.history.state;
    return Boolean(this.origin && indexFrom(state) === this.origin.index && this.browser.location.href === this.origin.href &&
      (state && typeof state === 'object' && 'key' in state ? state.key : undefined) === this.origin.key);
  }

  private clearPending(): void {
    this.pending = null;
    this.confirmed = false;
    this.browser.clearTimeout(this.replayTask);
    this.replayTask = undefined;
  }

  private clearApproval(): void {
    this.approvedPop = false;
    this.browser.clearTimeout(this.approvalTimer);
    this.approvalTimer = undefined;
  }

  private clearNativeBack(): void {
    this.nativeBackDelta = null;
    this.browser.clearTimeout(this.nativeBackTask);
    this.nativeBackTask = undefined;
  }

  private replay(): void {
    const action = this.pending;
    if (!action || !this.confirmed || !this.attached || this.options.blocked) return;
    this.clearPending();
    this.approvedPop = true;
    // Router go() is asynchronous; its next native pop must pass this owner.
    this.approvalTimer = this.browser.setTimeout(() => this.clearApproval(), 2000);
    replayDepth++;
    try { action(); }
    catch (error) { this.clearApproval(); throw error; }
    finally { replayDepth--; }
  }

  private clearRestoration(): void {
    if (this.restoring) {
      this.browser.clearTimeout(this.restoring.task);
      this.browser.clearTimeout(this.restoring.watchdog);
    }
    this.restoring = null;
  }

  private finishRestoration(): void {
    this.clearRestoration();
    if (!this.options.enabled && !this.options.onChildBack) this.origin = null;
    if (this.nativeBackDelta !== null) {
      const delta = this.nativeBackDelta;
      const hadChild = this.nativeBackHadChild, epoch = this.nativeBackEpoch;
      this.nativeBackDelta = null;
      if (this.nativeBackTask === undefined) this.nativeBackTask = this.browser.setTimeout(() => {
        this.nativeBackTask = undefined;
        if (!this.attached || (!this.options.enabled && !this.options.onChildBack)) return;
        if (epoch !== this.leaveEpoch || (hadChild && !this.options.onChildBack)) return;
        // Crop/icon/choice dialogs own their own cancellation and busy policy.
        // They consume Back before the enclosing child or shared draft can move.
        let dismissal: unknown;
        try { dismissal = this.dismissModal(); }
        catch { return; }
        if (dismissal !== false) { void Promise.resolve(dismissal).catch(() => undefined); return; }
        if (this.options.blocked) return;
        if (this.confirmed && this.pending) { this.replay(); return; }
        if (this.options.onChildBack && !this.pending) this.options.onChildBack();
        else if (this.options.enabled) this.requestLeave(() => this.browser.history.go(delta));
      }, 0);
      return;
    }
    if (this.confirmed) this.replayTask = this.browser.setTimeout(() => { this.replayTask = undefined; this.replay(); }, 0);
  }

  private scheduleRestoration(): void {
    const restoration = this.restoring;
    if (!this.attached || !restoration || restoration.inFlight || restoration.task !== undefined || restoration.retries > 2) return;
    // Native traversals are unreliable inside another popstate/microtask turn.
    restoration.task = this.browser.setTimeout(() => {
      restoration.task = undefined;
      if (!this.attached || this.restoring !== restoration || !this.origin) return;
      if (this.atOrigin()) { this.finishRestoration(); return; }
      const index = indexFrom(this.browser.history.state);
      if (index === null || index === this.origin.index) { this.clearRestoration(); this.clearPending(); return; }
      restoration.latestIndex = index;
      restoration.inFlight = true;
      this.browser.history.go(this.origin.index - index);
      restoration.watchdog = this.browser.setTimeout(() => {
        restoration.watchdog = undefined;
        if (!this.attached || this.restoring !== restoration) return;
        if (this.atOrigin()) { this.finishRestoration(); return; }
        restoration.inFlight = false;
        restoration.retries++;
        this.scheduleRestoration();
      }, 100 * (restoration.retries + 1));
    }, 0);
  }

  private onPop = (event: PopStateEvent): boolean => {
    if (!this.attached) return false;
    if (this.approvedPop) { this.clearApproval(); return false; }
    const index = indexFrom(event.state);
    if (this.restoring && this.origin && index !== null) {
      event.stopImmediatePropagation();
      if (this.atOrigin()) { this.finishRestoration(); return true; }
      const restoration = this.restoring;
      if (restoration.retries > 2) { restoration.retries = 0; restoration.inFlight = false; }
      if (Math.abs(this.origin.index - index) < Math.abs(this.origin.index - restoration.latestIndex)) {
        this.browser.clearTimeout(restoration.watchdog);
        restoration.inFlight = false;
      }
      restoration.latestIndex = index;
      this.scheduleRestoration();
      return true;
    }
    if ((!this.options.enabled && !this.options.onChildBack) || !this.origin || index === null || index === this.origin.index) return false;
    const delta = index - this.origin.index;
    const childBack = delta < 0 && Boolean(this.options.onChildBack) && !this.pending;
    if (!this.options.enabled && !childBack) return false;
    event.stopImmediatePropagation();
    this.restoring = { latestIndex: index, inFlight: false, retries: 0 };
    this.scheduleRestoration();
    if (delta < 0) { this.nativeBackDelta = delta; this.nativeBackHadChild = Boolean(this.options.onChildBack); this.nativeBackEpoch = this.leaveEpoch; }
    else this.requestLeave(() => this.browser.history.go(delta));
    return true;
  };

  private onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.attached || !this.options.enabled || this.approvedPop) return;
    event.preventDefault();
    event.returnValue = '';
  };
}

// MotionNavigation statically imports this module before BrowserRouter renders.
// With no attached profile owner this listener observes POP without changing it.
if (typeof window !== 'undefined') nativePopHandlers(window);
