import React from 'react';
import type { ProfileLink } from '../../types/domain';
import { profileLinkHref } from '../../features/profile/profileLinks';
import { getCategoryIcon } from './categoryIcons';

const TILE_CLASS = 'group relative flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center text-[var(--text-secondary)]';

/** Creator-defined external destinations, rendered in the sidebar control family. */
export function PlatformGrid({
  links,
  profileName,
}: {
  links: ProfileLink[];
  profileName: string;
}) {
  return <ul aria-label={`${profileName} links`} className="m-0 ml-auto flex w-fit max-w-full flex-wrap justify-end gap-1.5 p-0">
      {links.map((link, index) => {
        const Icon = getCategoryIcon(link.iconName ?? 'globe');
        const href = profileLinkHref(link.href);
        return <li key={`${link.label}-${link.href}-${index}`} className="list-none">
          <a href={href} target="_blank" rel="noreferrer" className={`${TILE_CLASS} transition-colors duration-150 hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] motion-reduce:transition-none`} title={`${link.label} — ${link.href}`} aria-label={`${link.label}: ${link.href}`}>
            <svg aria-hidden="true" viewBox="0 0 40 40" className="pointer-events-none absolute inset-0 h-10 w-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 motion-reduce:transition-none">
              <path d="M20 0.75C2.5 0.75 0.75 2.5 0.75 20s1.75 19.25 19.25 19.25S39.25 37.5 39.25 20 37.5 0.75 20 0.75Z" fill="none" stroke="var(--hairline-strong)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <Icon className="relative z-10 h-[18px] w-[18px]" />
          </a>
        </li>;
      })}
    </ul>;
}
