/**
 * Client-side validation for the auth forms.
 *
 * These are usability checks that keep obviously invalid submissions off the
 * network. They are never a substitute for validation at the service, and never
 * a substitute for authorization.
 */

/** Deliberately permissive: shape only, no attempt to prove deliverability. */
export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) {
    return 'Enter your email address.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}
export function validateRequiredPassword(value: string): string | null {
  if (!value) {
    return 'Enter your password.';
  }
  return null;
}

/** Used where a password is being created rather than recalled. */
export function validateNewPassword(value: string): string | null {
  if (!value) {
    return 'Choose a password.';
  }
  if (value.length < 8) {
    return 'Use at least 8 characters.';
  }
  return null;
}
export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) {
    return 'Re-enter your password.';
  }
  if (password !== confirmation) {
    return 'Both passwords must match.';
  }
  return null;
}