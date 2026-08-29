/**
 * The follow graph's error vocabulary.
 *
 * Follow used to reject with plain `Error`s, which forced the UI to guess what had
 * happened from a message string — so a refused follow, a deleted creator, and a
 * dropped connection were all handled identically, including being offered the
 * same pointless retry. These codes exist so each outcome can be branched on:
 * signing in fixes `unauthenticated`, nothing fixes `permission_denied`, and only
 * `network` and `unknown` are worth attempting again.
 */
export type SocialErrorCode = 'unauthenticated' | 'not_found' | 'permission_denied' | 'network' | 'unknown';
export class SocialServiceError extends Error {
  readonly code: SocialErrorCode;
  constructor(code: SocialErrorCode, message: string) {
    super(message);
    this.name = 'SocialServiceError';
    this.code = code;
  }
}

/** Only these describe a condition an identical second request could clear. */
export function isRetryableSocialCode(code: SocialErrorCode): boolean {
  return code === 'network' || code === 'unknown';
}