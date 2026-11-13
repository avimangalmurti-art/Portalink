import React from 'react';
import { HandshakeIcon, InfoIcon, MessagesSquareIcon } from 'lucide-react';
import type { ProfileLink } from '../../types/domain';
import { isProfileLinkAction, profileLinkHref } from '../../features/profile/profileLinks';
import { getCategoryIcon } from './categoryIcons';
import { loadProfileAudioSlot } from './usePrepareProfileAudio';

const TILE_CLASS = 'group relative flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center text-[var(--text-secondary)]';
const ProfileAudioSlot = React.lazy(loadProfileAudioSlot);

/** Profile information and external destinations in the sidebar control family. */
export function PlatformGrid({
  links,
  profileName,
  isSharedView = false,
  onOpenBio,
  onCollaboration,
  onMessage,
  profileAudio,
}: {
  links: ProfileLink[];
  profileName: string;
  isSharedView?: boolean;
  onOpenBio?: () => void;
  onCollaboration?: () => void;
  onMessage?: () => void;
  profileAudio?: { profileId: string; accountId: string | null; profileAvatar?: string; editable: boolean; active: boolean };
}) {
  return <ul role="list" aria-label={`${profileName} links`} className="profile-link-icons m-0 ml-auto flex w-fit max-w-full flex-wrap justify-end gap-1.5 p-0">
      {links.map((link, index) => {
        if (isProfileLinkAction(link.action)) {
          const audio = link.action === 'collaboration' && profileAudio
            ? <React.Suspense key={JSON.stringify(['profile-audio', profileAudio.profileId, profileAudio.accountId, profileAudio.editable])} fallback={null}>
              <ProfileAudioSlot {...profileAudio} profileName={profileName} sharedCatalogue={isSharedView} />
            </React.Suspense> : null;
          const showAction = !link.hidden && !(audio && !onCollaboration)
            && !(isSharedView && (link.action === 'collaboration' || link.action === 'message'));
          const action = { bio: onOpenBio, collaboration: onCollaboration, message: onMessage }[link.action];
          const Icon = { bio: InfoIcon, collaboration: HandshakeIcon, message: MessagesSquareIcon }[link.action];
          const control = showAction ? <li key={link.action} className="list-none"><button type="button" onClick={action} disabled={!action} aria-label={link.label} title={link.label} aria-haspopup={link.action === 'bio' ? 'dialog' : undefined}
            className={`${TILE_CLASS} rounded-[10px] transition-colors duration-[var(--m-fast)] hover:text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-45`}>
            <Icon aria-hidden="true" className="h-[22px] w-[22px]" />
          </button></li> : null;
          return audio ? <React.Fragment key={link.action}>{audio}{control}</React.Fragment> : control;
        }
        const Icon = getCategoryIcon(link.iconName ?? 'globe');
        const href = profileLinkHref(link.href);
        return <li key={`${link.label}-${link.href}-${index}`} className="list-none">
          <a href={href} target="_blank" rel="noreferrer" className={`${TILE_CLASS} rounded-[10px] transition-colors duration-[var(--m-fast)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-solid)] motion-reduce:transition-none`} title={`${link.label} — ${link.href}`} aria-label={`${link.label}: ${link.href}`}>
            <Icon className="relative z-10 h-[18px] w-[18px]" />
          </a>
        </li>;
      })}
    </ul>;
}
