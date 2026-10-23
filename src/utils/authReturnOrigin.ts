import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';

/** New Auth links always return to Portalink; loopback development stays local. */
export function authReturnOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && !url.username && !url.password) return url.origin;
  } catch { /* An invalid hosting address must never become an Auth return URL. */ }
  return PUBLIC_ORIGIN;
}
