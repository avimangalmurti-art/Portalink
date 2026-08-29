/**
 * Who is looking at a creator's surface.
 *
 * - `guest`    — nobody is signed in. Public reading is open; every action that
 *                mutates or exposes account functionality invites sign-in first.
 * - `visitor`  — a signed-in account that does not own this profile. It can act
 *                (follow, message) but never author.
 * - `owner`    — the authenticated account whose profile this is. Derived from the
 *                authenticated profile id, never from a display name or email.
 *
 * This type drives what the interface OFFERS. It is not a permission check: the
 * service decides what a viewer may actually read or write, and a real backend
 * must enforce that independently. Nothing here should be treated as security.
 */
export type ViewerRole = 'guest' | 'visitor' | 'owner';

/** Convenience for the common "may author" question. */
export function canAuthor(role: ViewerRole): boolean {
  return role === 'owner';
}

/** Whether an action needs the viewer to sign in before it can proceed. */
export function needsAccount(role: ViewerRole): boolean {
  return role === 'guest';
}