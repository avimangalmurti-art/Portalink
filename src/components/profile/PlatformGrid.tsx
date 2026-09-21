import React from 'react';
import type { ProfileLink } from '../../types/domain';
import { profileLinkHref } from '../../features/profile/profileLinks';
import { getCategoryIcon } from './categoryIcons';

const TILE_CLASS = 'group relative flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center text-[var(--text-secondary)]';

/** Profile information and external destinations in the sidebar control family. */
export function PlatformGrid({
  links,
  profileName,
  onOpenBio,
}: {
  links: ProfileLink[];
  profileName: string;
  onOpenBio?: () => void;
}) {
  return <ul aria-label={`${profileName} links`} className="profile-link-icons m-0 ml-auto flex w-fit max-w-full flex-wrap justify-end gap-1.5 p-0">
      {onOpenBio && <li className="list-none">
        <button type="button" onClick={onOpenBio} aria-label="Bio" title="Bio" aria-haspopup="dialog"
          className={`${TILE_CLASS} rounded-[10px] transition-colors duration-150 hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-solid)] motion-reduce:transition-none`}>
          <span aria-hidden="true" className="profile-bio-info-icon">i</span>
        </button>
      </li>}
      {links.map((link, index) => {
        const Icon = getCategoryIcon(link.iconName ?? 'globe');
        const href = profileLinkHref(link.href);
        return <li key={`${link.label}-${link.href}-${index}`} className="list-none">
          <a href={href} target="_blank" rel="noreferrer" className={`${TILE_CLASS} rounded-[10px] transition-colors duration-150 hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-solid)] motion-reduce:transition-none`} title={`${link.label} — ${link.href}`} aria-label={`${link.label}: ${link.href}`}>
            <Icon className="relative z-10 h-[18px] w-[18px]" />
          </a>
        </li>;
      })}
    </ul>;
}
