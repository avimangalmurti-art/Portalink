/** This URL selects a form; only the auth provider can establish recovery. */
export function isPasswordRecoveryReturn(href: string): boolean {
  const url = new URL(href);
  return url.searchParams.get('auth') === 'reset-password'
    || new URLSearchParams(url.hash.slice(1)).get('type') === 'recovery';
}

export function passwordRecoveryRedirect(origin: string): string {
  return new URL('/?auth=reset-password', origin).href;
}

export function clearPasswordRecoveryReturn(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('auth') !== 'reset-password') return;
  url.searchParams.delete('auth');
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has('error') || hash.has('error_code')) url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
