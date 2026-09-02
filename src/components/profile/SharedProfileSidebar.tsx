import React, { useEffect, useRef, useState } from 'react';
import { LogInIcon, MoonIcon, SettingsIcon, SunIcon, UserPlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import type { Profile } from '../../types/domain';
import type { AppearanceTheme } from '../../utils/appearancePreferences';
import { buildPath } from '../../app/routes';
import { ResizablePanelHandle, useResizablePanelWidth } from '../ui/ResizablePanelHandle';

type SharedProfileSidebarProps = {
  profile: Profile;
  activeCategoryId: string | null;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onOpenCategory: (categoryId: string) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
};

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
  const sharedSidebarWidth = useResizablePanelWidth({
    // A copied public link has its own maximum-width baseline. Its viewer-side
    // resize choice must not inherit a narrower navigation width saved by an
    // earlier implementation or by the signed-in workspace.
    id: 'shared-profile-navigation-standard',
    defaultWidth: 360,
    minWidth: 180,
    maxWidth: 360,
    viewportReserve: 320
  });
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
  return <aside data-resizable-panel="" style={{ width: `${sharedSidebarWidth.width}px` }} aria-label={`${profile.name} shared profile navigation`} className="shared-profile-sidebar sidebar-starfield relative flex h-full shrink-0 flex-col bg-transparent">
      <div className="global-control-header shrink-0 px-2">
        <div className="flex h-full w-full min-w-0 flex-1 items-center px-2">
          <Link to={buildPath('sharedProfile', { profileId: profile.id })} data-shared-profile-home="" aria-label={`Return to ${profile.name}'s profile landing page`} aria-current={activeCategoryId ? undefined : 'page'} className="group flex h-10 min-w-0 flex-1 items-center rounded-[10px] bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <span className={`cdx-dense-label min-w-0 flex-1 truncate text-[14px] font-semibold transition-colors duration-150 group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)] group-active:text-[var(--accent-text)] ${activeCategoryId ? 'text-[var(--text-primary)]' : 'text-[var(--accent-text)]'}`}>{profile.name}</span>
          </Link>
        </div>
      </div>

      <nav aria-label={`${profile.name} portals`} className="min-h-0 flex-1 overflow-y-auto px-2 pb-40 pt-3">
        <h2 className="relative my-2 flex h-7 w-full shrink-0 items-center">
          <span data-shared-portals-heading="" className="portals-heading flex h-full min-w-0 flex-1 items-center truncate bg-transparent pl-2 pr-2 text-left text-[14px] font-semibold text-[var(--text-tertiary)]">
            Portals
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
      <ResizablePanelHandle side="right" value={sharedSidebarWidth.width} min={180} max={360} onResize={sharedSidebarWidth.updateWidth} onResizeEnd={sharedSidebarWidth.commitWidth} onReset={sharedSidebarWidth.resetWidth} label="Resize shared profile navigation. Double-click to restore the default width." />
    </aside>;
}
