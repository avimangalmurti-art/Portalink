/** Welcome progress belongs to this document and resets on page refresh. */
export const CATALOG_HEADLINE = ['There’s a place', 'for the things', 'in your head.'] as const;
export const CATALOG_SUPPORT = ['Your creations.', 'Your thoughts.', 'Your process.'] as const;
export const CATALOG_HEADLINE_MS = 2500;
export const CATALOG_SUPPORT_START_MS = 2850;
export const CATALOG_TEXT_END_MS = 4650;
export const CATALOG_WELCOME_MS = 5000;

let completed = false;
let entered = false;

export function hasCompletedCatalogWelcome(): boolean {
  return completed;
}

export function rememberCatalogWelcomeCompletion(): void {
  completed = true;
}

/** Avoid a second welcome when the same page hands off to its account form. */
export function hasEnteredCatalogWelcome(): boolean { return entered; }
export function rememberCatalogWelcomeEntry(): void { entered = true; }

export function catalogWelcomeProgress(elapsed: number) {
  const length = (lines: readonly string[]) => lines.reduce((total, line) => total + Array.from(line).length, 0);
  const headlineLength = length(CATALOG_HEADLINE), supportLength = length(CATALOG_SUPPORT);
  return {
    headline: Math.floor(headlineLength * Math.max(0, Math.min(1, elapsed / CATALOG_HEADLINE_MS))),
    support: Math.floor(supportLength * Math.max(0, Math.min(1, (elapsed - CATALOG_SUPPORT_START_MS) / (CATALOG_TEXT_END_MS - CATALOG_SUPPORT_START_MS)))),
    supporting: elapsed >= CATALOG_SUPPORT_START_MS,
    textComplete: elapsed >= CATALOG_TEXT_END_MS,
    complete: elapsed >= CATALOG_WELCOME_MS,
  };
}

/** Recovery/OAuth callbacks retain their existing direct authentication flow. */
export function canOfferCatalogWelcome(view: string | null, search: string, hash: string): boolean {
  if (view !== 'signUp' && view !== 'signIn') return false;
  const callbacks = new Set(['auth', 'code', 'token', 'access_token', 'refresh_token', 'provider_token',
    'provider_refresh_token', 'token_hash', 'type', 'error', 'error_code', 'error_description']);
  return ![search, hash].some(part => Array.from(new URLSearchParams(part.replace(/^[?#]/, '')).keys())
    .some(key => callbacks.has(key.toLowerCase())));
}
