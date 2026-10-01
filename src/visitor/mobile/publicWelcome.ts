const COMPLETED_KEY = 'portalinknetworks.publicWelcome.mobile.v1';
let completedThisTab = false;

export function publicWelcomeCompleted(): boolean {
  if (completedThisTab) return true;
  try { return window.localStorage.getItem(COMPLETED_KEY) === 'done'; } catch { return false; }
}

export function completePublicWelcome(): void {
  completedThisTab = true;
  try { window.localStorage.setItem(COMPLETED_KEY, 'done'); } catch { /* Retain completion for this tab. */ }
}

export function shouldWelcomePublicVisitor(presentation: string, routeKind: string, hasProfile: boolean, completed: boolean, accountFlowOpen: boolean): boolean {
  return presentation === 'mobile' && routeKind === 'sharedProfile' && hasProfile && !completed && !accountFlowOpen;
}
