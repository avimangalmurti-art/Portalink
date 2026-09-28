import type { ProfileLink, ProfileLinkAction } from '../../types/domain';
import { profileLinkIconNames } from '../../components/profile/categoryIcons';

export const DEFAULT_PROFILE_LINK_ICON = 'globe';
export const MAX_PROFILE_LINKS = 20;

export const STANDARD_PROFILE_LINKS: readonly ProfileLink[] = [
  { action: 'bio', label: 'Bio', iconName: 'info', href: '' },
  { action: 'collaboration', label: 'Collaboration', iconName: 'handshake', href: '' },
  { action: 'message', label: 'Message', iconName: 'messages-square', href: '' },
];

export function isProfileLinkAction(action: unknown): action is ProfileLinkAction {
  return action === 'bio' || action === 'collaboration' || action === 'message';
}

const legacyPlatforms: Record<string, { label: string; iconName: string }> = {
  instagram: { label: 'Instagram', iconName: 'instagram' },
  x: { label: 'X', iconName: 'x' },
  pinterest: { label: 'Pinterest', iconName: 'pinterest' },
  website: { label: 'Website', iconName: 'globe' },
  tiktok: { label: 'TikTok', iconName: 'tiktok' },
  linkedin: { label: 'LinkedIn', iconName: 'linkedin' },
  snapchat: { label: 'Snapchat', iconName: 'snapchat' },
  soundcloud: { label: 'SoundCloud', iconName: 'soundcloud' },
  twitch: { label: 'Twitch', iconName: 'twitch' },
  youtube: { label: 'YouTube', iconName: 'youtube' },
  spotify: { label: 'Spotify', iconName: 'spotify' },
  behance: { label: 'Behance', iconName: 'behance' },
  dribbble: { label: 'Dribbble', iconName: 'dribbble' },
  github: { label: 'GitHub', iconName: 'github' },
  vimeo: { label: 'Vimeo', iconName: 'vimeo' },
  medium: { label: 'Medium', iconName: 'medium' },
};

function safeIconName(iconName: string | undefined): string {
  return iconName && profileLinkIconNames.includes(iconName) ? iconName : DEFAULT_PROFILE_LINK_ICON;
}

/**
 * Recognizes Instagram while a creator types or when an older profile link has
 * no saved brand icon. An explicitly selected non-default icon always wins.
 */
export function inferProfileLinkIconName(label: string, href: string, iconName?: string): string {
  const currentIcon = safeIconName(iconName);
  if (currentIcon !== DEFAULT_PROFILE_LINK_ICON) return currentIcon;

  const destination = `${label} ${href}`.toLowerCase();
  const isInstagram = /(^|[^a-z\d])instagram(?:\.com)?(?=$|[^a-z\d])/.test(destination)
    || /(^|\.)instagr\.am(?:[/:]|$)/.test(destination);
  return isInstagram ? 'instagram' : currentIcon;
}

/** Adds a web scheme only for navigation; the creator's entered value stays intact. */
export function profileLinkHref(href: string): string {
  const trimmed = href.trim();
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function normalizeProfileLink(link: ProfileLink): ProfileLink {
  if (isProfileLinkAction(link.action)) {
    const standard = STANDARD_PROFILE_LINKS.find(item => item.action === link.action);
    if (standard) return { ...standard, hidden: link.hidden === true };
  }
  return {
    label: link.label.trim(),
    href: link.href.trim(),
    iconName: inferProfileLinkIconName(link.label, link.href, link.iconName),
  };
}

/**
 * Reads both generations of profile destinations. Existing fixed social links
 * become ordinary custom links and are de-duplicated against already-migrated
 * destinations, so the transition never drops or repeats a creator's links.
 */
export function mergeProfileLinks(
  links: readonly ProfileLink[] | undefined,
  socialLinks: Record<string, string> | undefined,
): ProfileLink[] {
  const merged = (links ?? [])
    .filter(link => !isProfileLinkAction(link.action))
    .map(normalizeProfileLink)
    .filter((link) => Boolean(link.label && link.href && link.href !== '#'));
  const destinations = new Set(merged.map((link) => profileLinkHref(link.href).toLowerCase()));

  Object.entries(socialLinks ?? {}).forEach(([platformId, destination]) => {
    const href = destination.trim();
    if (!href) return;
    const normalizedDestination = profileLinkHref(href).toLowerCase();
    if (destinations.has(normalizedDestination)) return;
    const platform = legacyPlatforms[platformId] ?? {
      label: platformId.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      iconName: DEFAULT_PROFILE_LINK_ICON,
    };
    merged.push({ label: platform.label, href, iconName: safeIconName(platform.iconName) });
    destinations.add(normalizedDestination);
  });

  return merged.slice(0, MAX_PROFILE_LINKS);
}

/** Missing built-ins default on; explicit hidden records survive every save. */
export function resolveProfileLinks(links: readonly ProfileLink[] | undefined, socialLinks: Record<string, string> | undefined): ProfileLink[] {
  const result: ProfileLink[] = [];
  const seenActions = new Set<ProfileLinkAction>();
  const external = mergeProfileLinks(links, socialLinks);
  for (const link of links ?? []) {
    if (isProfileLinkAction(link.action)) {
      if (!seenActions.has(link.action)) result.push(normalizeProfileLink(link));
      seenActions.add(link.action);
    } else {
      const index = external.findIndex(item => item.href === link.href.trim() && item.label === link.label.trim());
      if (index >= 0) result.push(...external.splice(index, 1));
    }
  }
  return [...STANDARD_PROFILE_LINKS.filter(link => link.action && !seenActions.has(link.action)).map(normalizeProfileLink), ...result, ...external];
}
