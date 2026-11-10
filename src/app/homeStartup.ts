/** Startup readiness affects only the opening Home, never later navigation. */
export type HomeStartupProps = {
  homeStartupPending?: boolean;
  homeStartupAttempt?: number;
  onHomeStartupReady?: (ready: boolean) => void;
  onHomeStartupShellReady?: (ready: boolean) => void;
  installedHomeOpening?: InstalledHomeOpening | null;
};

export type InstalledHomeOpening = { refresh: boolean; complete: () => void };

export const HOME_STARTUP_TIMEOUT_MS = 12_000;
