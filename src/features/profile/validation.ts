import { normalizePublicHandle, validHandle } from '../sharing/shareModel';
/**
 * Profile validation, shared by onboarding and later profile editing.
 *
 * These are usability rules that keep obviously invalid submissions off the
 * network. They are not authorization, and they are not authoritative
 * uniqueness — the database owns that.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const NAME_MAX_LENGTH = 48;
export const LOCATION_MAX_LENGTH = 48;

/**
 * One normalization used everywhere: form, availability check, and creation.
 * Lowercased, no leading "@", separators collapsed to a single underscore.
 */
export function normalizeHandle(value: string): string {
  return normalizePublicHandle(value);
}

/** Presentation form of a stored handle. */
export function formatHandle(handle: string): string {
  return `@${normalizeHandle(handle)}`;
}
export function validateProfileName(value: string): string | null {
  const name = value.trim();
  if (!name) {
    return 'Enter the name that should appear on your profile.';
  }
  if (name.length > NAME_MAX_LENGTH) {
    return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Format only. Availability is a separate, asynchronous question. */
export function validateHandle(value: string): string | null {
  return validHandle(normalizeHandle(value)) ? null : 'Use 3–30 lowercase letters, numbers or dots, and a non-reserved address.';
}
/** Optional field: only length is checked. */
export function validateLocation(value: string): string | null {
  if (value.trim().length > LOCATION_MAX_LENGTH) {
    return `Use ${LOCATION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export const PROFILE_LINK_LABEL_MAX_LENGTH = 48;
export const PROFILE_LINK_URL_MAX_LENGTH = 1000;
/** Kept as an alias while legacy fixed-platform records are migrated. */
export const SOCIAL_LINK_MAX_LENGTH = PROFILE_LINK_URL_MAX_LENGTH;

/**
 * A social destination is optional. When present it only has to look like a
 * destination — the platform, not this form, decides whether it resolves.
 */
export function validateSocialLink(value: string): string | null {
  const link = value.trim();
  if (!link) {
    return null;
  }
  if (link.length > SOCIAL_LINK_MAX_LENGTH) {
    return `Use ${SOCIAL_LINK_MAX_LENGTH} characters or fewer.`;
  }
  if (/\s/.test(link)) {
    return 'Remove the spaces from this address.';
  }
  return null;
}

export function validateProfileLinkLabel(value: string): string | null {
  const label = value.trim();
  if (!label) return 'Add a name for this link.';
  if (label.length > PROFILE_LINK_LABEL_MAX_LENGTH) {
    return `Use ${PROFILE_LINK_LABEL_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Any web destination is accepted; executable and embedded-data schemes are not. */
export function validateProfileLinkUrl(value: string): string | null {
  const href = value.trim();
  if (!href) return 'Add the destination URL.';
  if (href.length > PROFILE_LINK_URL_MAX_LENGTH) {
    return `Use ${PROFILE_LINK_URL_MAX_LENGTH} characters or fewer.`;
  }
  if (/\s/.test(href)) return 'Remove spaces from this URL.';
  if (/^(?:javascript|data|vbscript):/i.test(href)) return 'Use a safe web address.';
  try {
    const parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(href) ? href : `https://${href}`);
    if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return 'Use an HTTP, HTTPS, email, or telephone link.';
    }
  } catch {
    return 'Enter a complete URL.';
  }
  return null;
}

/** Initials are derived, never asked for. */
export function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '??';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
