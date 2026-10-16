// Canonical public host; local previews must never produce localhost citations.
const configured = import.meta.env?.VITE_PUBLIC_ORIGIN?.trim() || 'https://portalinknetworks.com';
const origin = new URL(configured);
if (origin.protocol !== 'https:' || /^(localhost|127\.|\[?::1\]?)/i.test(origin.hostname)) {
  throw new Error('VITE_PUBLIC_ORIGIN must be the HTTPS public Portalink host.');
}
export const PUBLIC_ORIGIN = origin.origin;
