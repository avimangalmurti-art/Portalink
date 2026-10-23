export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'other';
export type InstallStatus = 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'failed';
export type MobileInstallState = {
  standalone: boolean;
  platform: InstallPlatform;
  canPrompt: boolean;
  status: InstallStatus;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & { standalone?: boolean };
type InstallEnvironment = {
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'matchMedia'>;
  navigator: InstallNavigator;
};

const initialState: MobileInstallState = { standalone: false, platform: 'other', canPrompt: false, status: 'idle' };

function instructionPlatform(navigator: InstallNavigator): InstallPlatform {
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent) ? 'ios-safari' : 'ios-other';
  return /Android/i.test(navigator.userAgent) ? 'android' : 'other';
}

/** One page-lifetime prompt; capture is explicitly mounted by the mobile shell. */
export function createMobileInstallStore(environment: () => InstallEnvironment = () => ({ window, navigator })) {
  let state = initialState;
  let prompt: InstallPromptEvent | null = null;
  let owners = 0, generation = 0, busy = false;
  let cleanup: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: MobileInstallState) => {
    if (Object.keys(next).every(key => next[key as keyof MobileInstallState] === state[key as keyof MobileInstallState])) return;
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    capture() {
      owners += 1;
      if (owners === 1) {
        const current = ++generation;
        const { window: host, navigator } = environment();
        const modes = typeof host.matchMedia === 'function'
          ? ['standalone', 'fullscreen', 'minimal-ui'].map(mode => host.matchMedia(`(display-mode: ${mode})`)) : [];
        let installed = false;
        const refresh = () => {
          if (generation !== current || !owners) return;
          const standalone = installed || navigator.standalone === true || modes.some(mode => mode.matches);
          if (standalone) { prompt = null; busy = false; }
          publish({ ...state, standalone, platform: instructionPlatform(navigator), canPrompt: Boolean(prompt) && !standalone, status: standalone ? 'idle' : state.status });
        };
        const onInstalled = () => { installed = true; refresh(); };
        const onPrompt = (event: Event) => {
          const candidate = event as InstallPromptEvent;
          if (typeof candidate.prompt !== 'function') return;
          // Store the browser's capability without opening or advertising it.
          event.preventDefault();
          if (state.standalone || busy || generation !== current) return;
          prompt = candidate;
          publish({ ...state, canPrompt: true, status: 'idle' });
        };
        refresh();
        host.addEventListener('beforeinstallprompt', onPrompt);
        host.addEventListener('appinstalled', onInstalled);
        host.addEventListener('pageshow', refresh);
        const stopModes = modes.map(mode => {
          if (typeof mode.addEventListener === 'function') {
            mode.addEventListener('change', refresh);
            return () => mode.removeEventListener('change', refresh);
          }
          mode.addListener?.(refresh);
          return () => mode.removeListener?.(refresh);
        });
        cleanup = () => {
          host.removeEventListener('beforeinstallprompt', onPrompt);
          host.removeEventListener('appinstalled', onInstalled);
          host.removeEventListener('pageshow', refresh);
          for (const stop of stopModes) stop();
        };
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        owners -= 1;
        if (owners > 0) return;
        generation += 1;
        cleanup?.(); cleanup = undefined;
        prompt = null; busy = false;
        publish(initialState);
      };
    },
    requestInstall() {
      if (!owners || !prompt || busy || state.standalone) return;
      const candidate = prompt, current = generation;
      prompt = null; busy = true;
      publish({ ...state, canPrompt: false, status: 'prompting' });
      const finish = (status: InstallStatus) => {
        if (current !== generation || !owners || state.standalone) return;
        busy = false;
        publish({ ...state, status });
      };
      try {
        // Must run in the button's trusted activation, before any await.
        const shown = candidate.prompt();
        void Promise.all([shown, candidate.userChoice])
          .then(([, choice]) => finish(choice.outcome === 'accepted' ? 'accepted' : 'dismissed'))
          .catch(() => finish('failed'));
      } catch { finish('failed'); }
    },
  };
}

export const mobileInstallStore = createMobileInstallStore();
