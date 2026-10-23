import type { Navigator, To } from 'react-router-dom';

/** Outer history metadata; React Router's usr/key/idx remain untouched. */
export const MOBILE_AUTHORING_HISTORY_MARKER = 'portalinkMobileAuthoring';
export type AuthoringHistoryNavigator = Pick<Navigator, 'push' | 'replace' | 'go' | 'createHref'>;
export type MobileAuthoringHistoryOptions = {
  enabled: boolean;
  active: boolean;
  scope: string | null;
  href: string;
  state: unknown;
  navigator: AuthoringHistoryNavigator | null;
  dismissTopModal: () => unknown;
  reopen: () => unknown;
};
type Browser = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
type Marker = { version: 1; runtime: string; token: string; scope: string };
type Entry = {
  activation: number;
  marker: Marker;
  baseHref: string;
  baseState: unknown;
  ownedState: Record<string, unknown>;
  phase: 'armed' | 'closed' | 'finished';
  reopenable: boolean;
  reopening: boolean;
};
type Restoration = { entry: Entry; latestIndex: number; inFlight: boolean; exhausted: boolean; retries: number; task?: number; watchdog?: number };
type Destination = { entry: Entry; navigator: AuthoringHistoryNavigator; to: To; state: unknown; options?: Parameters<Navigator['replace']>[2]; before?: () => void; href: string };
let sequence = 0;
const controllers = new Set<MobileAuthoringHistoryController>();
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function markerFrom(state: unknown): Marker | null {
  const marker = object(state) ? state[MOBILE_AUTHORING_HISTORY_MARKER] : null;
  return object(marker) && marker.version === 1 && typeof marker.runtime === 'string' && typeof marker.token === 'string' && typeof marker.scope === 'string'
    ? marker as Marker : null;
}
function sameEntry(left: unknown, right: unknown): boolean {
  if (object(left) && object(right)) return left.key === right.key && left.idx === right.idx;
  return left === right;
}

/** One in-memory owner. Detaching does not navigate, including StrictMode replay. */
export class MobileAuthoringHistoryController {
  private readonly runtime = `authoring-${Date.now()}-${++sequence}`;
  private options: MobileAuthoringHistoryOptions | null = null;
  private entry: Entry | null = null;
  private attached = false;
  private arming = false;
  private consuming: Entry | null = null;
  private consumeTask: number | undefined;
  private dismissing: Entry | null = null;
  private restoring: Restoration | null = null;
  private destination: Destination | null = null;
  private activation = 0;

  constructor(private readonly browser: Browser) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.browser.addEventListener('popstate', this.onPop, true);
    controllers.add(this);
    if (this.restoring) { this.restoring.exhausted = false; this.restoring.retries = 0; this.scheduleRestore(this.restoring); }
    if (this.consuming) this.scheduleConsume(this.consuming);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.browser.removeEventListener('popstate', this.onPop, true);
    controllers.delete(this);
    this.clearConsumeTask();
    if (this.restoring) { this.clearRestorationTimers(this.restoring); this.restoring.inFlight = false; }
  }

  update(options: MobileAuthoringHistoryOptions): void {
    const changedScope = this.options?.scope !== options.scope || this.options?.enabled !== options.enabled;
    const closingAfterExhaustion = Boolean(this.restoring?.exhausted && this.options?.active && !options.active);
    if (options.active && (!this.options?.active || options.scope !== this.options.scope)) this.activation++;
    this.options = options;
    if (!this.attached) return;
    if ((changedScope || closingAfterExhaustion) && this.restoring) {
      this.clearRestorationTimers(this.restoring); this.restoring.inFlight = false; this.restoring.exhausted = false; this.restoring.retries = 0;
      this.scheduleRestore(this.restoring);
    }
    const entry = this.entry;
    const scoped = Boolean(options.enabled && options.scope && options.navigator);
    if (entry && (!scoped || entry.marker.scope !== options.scope)) {
      entry.reopenable = false;
      entry.reopening = false;
      if (this.ownsCurrent(entry)) this.consume(entry);
    }
    if (!scoped) {
      this.stripStaleMarker();
      return;
    }
    if (options.active) {
      if (entry && !this.consuming && !this.restoring && this.ownsCurrent(entry) && entry.marker.scope === options.scope && entry.phase !== 'finished') {
        entry.activation = this.activation; entry.phase = 'armed'; entry.reopening = false;
        return;
      }
      if (!this.consuming && !this.restoring) this.arm();
    } else if (entry && !entry.reopening && this.ownsCurrent(entry)) {
      this.consume(entry);
    } else {
      this.stripStaleMarker();
    }
  }

  /** Publication replaces its owned overlay stop, leaving the prior page intact. */
  replaceDestination(navigator: AuthoringHistoryNavigator, to: To, state?: unknown, options?: Parameters<Navigator['replace']>[2], before?: () => void): boolean {
    const entry = this.entry, current = this.options;
    if (!this.attached || !current?.enabled || !current.active || current.navigator !== navigator || !entry || entry.marker.scope !== current.scope || entry.phase !== 'armed' || (!this.ownsCurrent(entry) && this.restoring?.entry !== entry)) return false;
    const destination = this.absolute(navigator.createHref(to));
    if (!destination) return false;
    entry.phase = 'finished'; entry.reopenable = false; entry.reopening = false;
    this.destination = { entry, navigator, to, state, options, before, href: destination };
    if (!this.restoring) this.finishDestination();
    return true;
  }

  private finishDestination(): void {
    const destination = this.destination;
    if (!destination) return;
    this.destination = null;
    const { entry, navigator, to, state, options, before, href } = destination;
    if (!this.options?.enabled || this.options.scope !== entry.marker.scope || this.activation !== entry.activation || !this.ownsCurrent(entry)) { this.consume(entry); return; }
    before?.();
    if (href === entry.baseHref) this.consume(entry);
    else {
      try { navigator.replace(to, state, options); }
      catch (error) { entry.phase = 'armed'; throw error; }
    }
  }

  private absolute(href: string): string | null {
    try { const url = new URL(href, this.browser.location.href); return url.origin === this.browser.location.origin ? url.href : null; }
    catch { return null; }
  }

  private ownsCurrent(entry: Entry): boolean {
    const marker = markerFrom(this.browser.history.state);
    return marker?.runtime === this.runtime && marker.token === entry.marker.token;
  }

  private stripStaleMarker(): void {
    const state: unknown = this.browser.history.state;
    if (!object(state) || !(MOBILE_AUTHORING_HISTORY_MARKER in state)) return;
    const marker = markerFrom(state), entry = this.entry, current = this.options;
    if (entry && marker?.runtime === this.runtime && marker.token === entry.marker.token && current?.enabled && marker.scope === current.scope && (entry.phase === 'armed' || entry.phase === 'closed' && entry.reopenable)) return;
    const clean = { ...state }; delete clean[MOBILE_AUTHORING_HISTORY_MARKER];
    this.browser.history.replaceState(clean, '', this.browser.location.href);
  }

  private arm(): void {
    const current = this.options;
    if (this.arming || !current?.enabled || !current.active || !current.scope || !current.navigator || this.absolute(current.href) !== this.browser.location.href) return;
    this.stripStaleMarker();
    this.arming = true;
    try {
      const baseHref = this.browser.location.href, baseState: unknown = this.browser.history.state;
      // Use the immediate Router navigator so it owns its key, idx and location.
      current.navigator.push(current.href, current.state);
      const native: unknown = this.browser.history.state;
      if (!object(native)) return;
      const marker: Marker = { version: 1, runtime: this.runtime, token: `${this.runtime}:${++sequence}`, scope: current.scope };
      const ownedState = { ...native, [MOBILE_AUTHORING_HISTORY_MARKER]: marker };
      this.entry = { activation: this.activation, marker, baseHref, baseState, ownedState, phase: 'armed', reopenable: true, reopening: false };
      this.browser.history.replaceState(ownedState, '', baseHref);
    } finally { this.arming = false; }
  }

  private consume(entry: Entry): void {
    if (this.restoring?.entry === entry) { if (entry.phase !== 'finished') entry.phase = 'closed'; return; }
    if (this.consuming || !this.ownsCurrent(entry)) return;
    if (entry.phase !== 'finished') entry.phase = 'closed';
    this.consuming = entry;
    this.scheduleConsume(entry);
  }

  private scheduleConsume(entry: Entry): void {
    if (this.consumeTask !== undefined) return;
    this.consumeTask = this.browser.setTimeout(() => {
      this.consumeTask = undefined;
      if (!this.attached || this.consuming !== entry) return;
      // Opting out strips only our outer marker before this task runs. The
      // original Router key/idx/href still prove which stop is being consumed.
      if (!sameEntry(this.browser.history.state, entry.ownedState) || this.browser.location.href !== entry.baseHref) { this.consuming = null; return; }
      // The acknowledgement must start outside the compensation's popstate too.
      this.browser.history.back();
    }, 0);
  }

  private clearConsumeTask(): void {
    if (this.consumeTask !== undefined) this.browser.clearTimeout(this.consumeTask);
    this.consumeTask = undefined;
  }

  private restore(entry: Entry, index: number): void {
    const restoration = this.restoring ??= { entry, latestIndex: index, inFlight: false, exhausted: false, retries: 0 };
    restoration.latestIndex = index;
    this.scheduleRestore(restoration);
  }

  private scheduleRestore(restoration: Restoration): void {
    if (restoration.inFlight || restoration.exhausted || restoration.task !== undefined) return;
    // A microtask still runs inside the browser's traversal turn. Some browsers
    // ignore go() there while another Back is queued; coalesce into a new task.
    restoration.task = this.browser.setTimeout(() => {
      restoration.task = undefined;
      if (!this.attached || this.restoring !== restoration) return;
      const native: unknown = this.browser.history.state;
      const index = object(native) ? native.idx : undefined;
      const target = restoration.entry.ownedState.idx;
      if (typeof index !== 'number' || typeof target !== 'number' || !Number.isInteger(index) || !Number.isInteger(target)) return;
      if (this.ownsCurrent(restoration.entry)) { this.finishRestore(restoration); return; }
      if (index === target) {
        // A different Router navigation has already replaced this entry.
        this.clearRestorationTimers(restoration);
        this.restoring = null; this.destination = null;
        restoration.entry.phase = 'finished'; restoration.entry.reopenable = false;
        return;
      }
      restoration.latestIndex = index;
      restoration.inFlight = true;
      this.browser.history.go(target - index);
      // A browser may ignore a traversal request without emitting popstate.
      // Retry at most twice, always from the actual current native index.
      restoration.watchdog = this.browser.setTimeout(() => {
        restoration.watchdog = undefined;
        if (!this.attached || this.restoring !== restoration) return;
        if (this.ownsCurrent(restoration.entry)) { this.finishRestore(restoration); return; }
        if (restoration.retries >= 2) { restoration.inFlight = false; restoration.exhausted = true; return; }
        restoration.retries++; restoration.inFlight = false; this.scheduleRestore(restoration);
      }, 100 * (restoration.retries + 1));
    }, 0);
  }

  private clearRestorationTimers(restoration: Restoration): void {
    if (restoration.task !== undefined) this.browser.clearTimeout(restoration.task);
    if (restoration.watchdog !== undefined) this.browser.clearTimeout(restoration.watchdog);
    restoration.task = undefined; restoration.watchdog = undefined;
  }

  private finishRestore(restoration: Restoration): void {
    if (this.restoring !== restoration) return;
    this.clearRestorationTimers(restoration);
    this.restoring = null;
    const entry = restoration.entry, current = this.options;
    if (this.destination?.entry === entry) { this.finishDestination(); return; }
    if (!current?.enabled || current.scope !== entry.marker.scope || this.activation !== entry.activation || !current.active && !entry.reopening || entry.phase !== 'armed') this.consume(entry);
  }

  private requestDismiss(entry: Entry): void {
    if (this.dismissing === entry) return;
    this.dismissing = entry;
    let result: unknown;
    try { result = this.options?.dismissTopModal(); }
    catch { this.dismissing = null; return; }
    void Promise.resolve(result).catch(() => undefined).finally(() => {
      if (this.dismissing === entry) this.dismissing = null;
    });
  }

  private onPop = (event: PopStateEvent): void => {
    const entry = this.entry, current = this.options;
    const index = object(event.state) ? event.state.idx : undefined;
    const ownedIndex = entry?.ownedState.idx;
    const beforeOwned = typeof index === 'number' && Number.isInteger(index) && typeof ownedIndex === 'number' && index < ownedIndex;
    if (this.restoring) {
      const restoration = this.restoring;
      event.stopImmediatePropagation();
      if (restoration.exhausted) { restoration.exhausted = false; restoration.retries = 0; }
      if (this.ownsCurrent(restoration.entry) && sameEntry(event.state, restoration.entry.ownedState)) {
        this.finishRestore(restoration);
      } else if (typeof index === 'number' && Number.isInteger(index)) {
        // Only one compensation may be outstanding. More queued Back events
        // move down; an arriving forward compensation may land short because its
        // starting point moved. Continue from that actual arrival, never stack
        // several relative go() calls which could overshoot the owned entry.
        if (restoration.inFlight && index > restoration.latestIndex) {
          this.clearRestorationTimers(restoration); restoration.inFlight = false; restoration.retries = 0;
        }
        restoration.latestIndex = index;
        this.scheduleRestore(restoration);
      }
      return;
    }
    if (this.consuming) {
      const consumed = this.consuming;
      this.clearConsumeTask();
      this.consuming = null;
      if (this.browser.location.href !== consumed.baseHref || !sameEntry(event.state, consumed.baseState)) {
        if (entry && beforeOwned) { event.stopImmediatePropagation(); this.restore(entry, index as number); return; }
        this.stripStaleMarker();
        return;
      }
      // This pop is the acknowledged close, and Router must observe it once.
      this.stripStaleMarker();
      queueMicrotask(() => { if (this.attached && this.options?.active && this.activation !== consumed.activation) this.arm(); });
      return;
    }
    if (entry && beforeOwned && current?.enabled && current.scope === entry.marker.scope && entry.phase === 'armed' && (current.active || entry.reopening)) {
      // Keep Router mounted on its owned entry while queued native Back events
      // drain, even if they reach an earlier URL before saving has completed.
      event.stopImmediatePropagation();
      this.restore(entry, index as number);
      this.requestDismiss(entry);
      return;
    }
    const marker = markerFrom(event.state);
    if (entry && marker?.runtime === this.runtime && marker.token === entry.marker.token && entry.phase === 'closed' && entry.reopenable && current?.enabled && current.scope === marker.scope && !current.active) {
      entry.phase = 'armed'; entry.reopening = true;
      // Let Router observe Forward before asking the application to reopen its
      // ordinary recovery chooser; the marker contains no draft or file data.
      queueMicrotask(() => {
        if (!this.attached || this.entry !== entry || !this.ownsCurrent(entry) || !this.options?.enabled || this.options.scope !== entry.marker.scope) return;
        let result: unknown;
        try { result = this.options.reopen(); }
        catch { entry.reopening = false; this.consume(entry); return; }
        const refused = () => {
          if (this.entry !== entry || !entry.reopening || this.options?.active || this.options?.scope !== entry.marker.scope) return;
          entry.reopening = false; this.consume(entry);
        };
        void Promise.resolve(result).then(value => { if (value === false) refused(); }, refused);
      });
      return;
    }
    this.stripStaleMarker();
  };
}

export function createMobileAuthoringHistory(browser: Browser): MobileAuthoringHistoryController {
  return new MobileAuthoringHistoryController(browser);
}

/** Used only by the immediate navigation adapter; ordinary navigation falls through. */
export function replaceMobileAuthoringDestination(navigator: AuthoringHistoryNavigator, to: To, state?: unknown, options?: Parameters<Navigator['replace']>[2], before?: () => void): boolean {
  for (const controller of [...controllers].reverse()) if (controller.replaceDestination(navigator, to, state, options, before)) return true;
  return false;
}
