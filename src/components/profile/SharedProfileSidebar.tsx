import React, { useEffect, useRef, useState } from 'react';
import { LogInIcon, MoonIcon, SettingsIcon, SunIcon, UserPlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { CreatorAvatar } from './CreatorAvatar';
import type { Profile } from '../../types/domain';
import type { AppearanceTheme } from '../../utils/appearancePreferences';
import { buildPath } from '../../app/routes';

type SharedProfileSidebarProps = {
  profile: Profile;
  activeCategoryId: string | null;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onOpenCategory: (categoryId: string) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
};

function possessivePortals(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] || 'Creator';
  return `${firstName}${firstName.toLowerCase().endsWith('s') ? '’' : '’s'} Portals`;
}

/**
 * The shell used by a shared profile URL. It deliberately contains only the
 * creator and their public Portal navigation: no Home, account, messaging,
 * network, publishing, following, or platform-discovery controls. The footer
 * offers the one intentional exit: sign in or create a Portalink account.
 */
export function SharedProfileSidebar({
  profile,
  activeCategoryId,
  theme,
  onThemeChange,
  onOpenCategory,
  onSignIn,
  onCreateAccount
}: SharedProfileSidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSettingsOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!settingsMenuRef.current?.contains(target) && !settingsTriggerRef.current?.contains(target)) {
        setIsSettingsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
        settingsTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSettingsOpen]);
  const openAuth = (request: () => void) => {
    setIsSettingsOpen(false);
    request();
  };
  return <aside aria-label={`${profile.name} shared profile navigation`} className="shared-profile-sidebar sidebar-starfield relative flex h-full w-[208px] shrink-0 flex-col bg-transparent lg:w-[216px] 2xl:w-[224px]">
      <div className="global-control-header shrink-0 px-2">
        <div className="flex h-full w-full min-w-0 flex-1 items-center justify-between gap-2 px-2">
          <button type="button" onClick={onSignIn} data-keep-color="" data-shared-brand-sign-in="" aria-label="Sign in to Portalink Networks" className="flex min-w-0 flex-1 flex-col bg-transparent p-0 text-left text-[16px] font-bold leading-[1.05] text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <span className="block truncate">Portalink</span>
            <span className="block truncate">Networks</span>
          </button>
          {activeCategoryId ? <Link to={buildPath('sharedProfile', { profileId: profile.id })} data-shared-profile-home="" aria-label={`Return to ${profile.name}'s profile landing page`} className="shape-compact flex h-10 w-10 shrink-0 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="compact" className="h-10 w-10 text-[12px]" />
            </Link> : null}
        </div>
      </div>

      <nav aria-label={possessivePortals(profile.name)} className="min-h-0 flex-1 overflow-y-auto px-2 pb-40 pt-3">
        <h2 className="relative my-2 flex h-7 w-full shrink-0 items-center">
          <span data-shared-portals-heading="" className="portals-heading flex h-full min-w-0 flex-1 items-center truncate bg-transparent pl-2 pr-2 text-left text-[14px] font-semibold text-[var(--text-tertiary)]">
            {possessivePortals(profile.name)}
          </span>
        </h2>
        <ul className="sidebar-pill-group m-0 flex list-none flex-col p-0">
          {profile.categories.map((category) => {
          const Icon = getCategoryIcon(category.iconName);
          const isActive = category.id === activeCategoryId;
          return <li key={category.id} className="side-panel-row group/row relative mb-[var(--side-panel-row-gap)] w-full list-none">
                <button type="button" data-category-row="" onClick={() => onOpenCategory(category.id)} aria-current={isActive ? 'page' : undefined} className={`ps-list-btn sidebar-pill-row flex h-full w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[180ms] ease-out focus:outline-none ${isActive ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
                  <span aria-hidden="true" data-icon-tile="" className="flex h-4 w-6 shrink-0 items-center justify-center">
                    <InterfaceIcon icon={Icon} weight="medium" />
                  </span>
                  <span className="cdx-dense-label min-w-0 flex-1 truncate py-0.5" title={category.label}>{category.label}</span>
                  <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true" />
                </button>
              </li>;
        })}
        </ul>
      </nav>

      <div data-shared-join-footer="" className={`pointer-events-none absolute inset-x-3 z-30 transition-[bottom] duration-200 ease-out motion-reduce:transition-none ${isSettingsOpen ? 'bottom-[156px]' : 'bottom-[60px]'}`}>
        <a href="/?auth=signIn" target="_blank" rel="noopener noreferrer" aria-label="Join the Portalink Network (opens in a new tab)" data-shared-join-link="" className="pointer-events-auto inline-flex min-h-9 w-full items-center justify-center rounded-full bg-[var(--system-pink)] px-3 py-1.5 text-center text-[13px] font-semibold leading-[1.05] text-black shadow-[0_10px_24px_rgba(0,0,0,0.32)] transition-[filter,transform] duration-150 hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span>Join the Portalink<br />Network</span>
        </a>
      </div>

      <div data-shared-account-footer="" className="absolute inset-x-2 bottom-2 z-40">
        <div className="relative flex h-10 items-center justify-between px-1">
          {isSettingsOpen ? <div ref={settingsMenuRef} role="menu" aria-label="Portalink account options" data-shared-account-menu="" className="account-menu-popover absolute bottom-12 left-1 right-1 overflow-hidden rounded-[12px] p-1.5 text-[var(--text-primary)]">
              <button type="button" role="menuitem" onClick={() => openAuth(onCreateAccount)} className="account-menu-row flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center"><InterfaceIcon icon={UserPlusIcon} size="sm" weight="medium" /></span>
                <span className="whitespace-nowrap leading-none">Create an account</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openAuth(onSignIn)} className="account-menu-row flex h-9 w-full items-center gap-2 rounded-[8px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center"><InterfaceIcon icon={LogInIcon} size="sm" weight="medium" /></span>
                <span className="whitespace-nowrap leading-none">Sign in</span>
              </button>
            </div> : null}
          <button ref={settingsTriggerRef} type="button" onClick={() => setIsSettingsOpen((open) => !open)} aria-label={isSettingsOpen ? 'Close settings' : 'Open settings'} aria-haspopup="menu" aria-expanded={isSettingsOpen} className="side-panel-compact-control shape-compact flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={SettingsIcon} size="sm" weight="medium" />
          </button>
          <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch shared Portalink to light mode' : 'Switch shared Portalink to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} data-system-color="" className="shared-profile-theme-toggle side-panel-compact-control shape-compact flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {theme === 'dark' ? <InterfaceIcon icon={SunIcon} size="sm" weight="medium" /> : <InterfaceIcon icon={MoonIcon} size="sm" weight="medium" />}
          </button>
        </div>
      </div>
    </aside>;
}
