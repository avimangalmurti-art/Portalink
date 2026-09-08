import { useCompactNavigation } from '../../hooks/useCompactNavigation';
import React, { useEffect, useRef, useState } from 'react';
import { HomeIcon, LogInIcon, MoonIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SettingsIcon, SunIcon, UserPlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import type { Profile } from '../../types/domain';
import type { AppearanceTheme } from '../../utils/appearancePreferences';
import { buildPath } from '../../app/routes';
import { ResizablePanelHandle, useResizablePanelWidth } from '../ui/ResizablePanelHandle';
import { panelLayoutDefaults, PANEL_LAYOUT_RESET_EVENT } from '../../utils/panelLayoutDefaults';

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
    // Public viewing keeps its own resize choice, with the same navigation default.
    id: 'shared-profile-navigation-standard',
    defaultWidth: panelLayoutDefaults.navigation,
    minWidth: 180,
    maxWidth: 360,
    viewportReserve: 320
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // This is the public viewer's visit, not the owner's saved workspace layout.
  // Preserve the choice between shared routes.
  const [preferredCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const reset = () => setIsCollapsed(false);
    window.addEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
  }, []);
  const compactNavigation = useCompactNavigation(preferredCollapsed, setIsCollapsed);
  const isCollapsed = compactNavigation.collapsed;
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
  const toggleLabel = isCollapsed ? 'Expand navigation' : 'Collapse navigation';
  return <aside data-resizable-panel="" data-collapsed={isCollapsed ? 'true' : 'false'} style={isCollapsed ? undefined : { width: `${sharedSidebarWidth.width}px` }} aria-label={`${profile.name} shared profile navigation`} className={`shared-profile-sidebar sidebar-starfield relative flex h-full min-h-0 shrink-0 flex-col bg-transparent transition-[width] duration-150 motion-reduce:transition-none ${isCollapsed ? 'w-[48px] sm:w-[52px]' : ''}`}>
      <div data-shared-navigation-header="" className={`global-control-header shrink-0 ${isCollapsed ? 'justify-center' : 'px-2'}`}>
        <div data-shared-navigation-row="" className={`flex h-full w-full min-w-0 flex-1 items-center ${isCollapsed ? 'justify-center' : 'side-panel-control-row'}`}>
          {!isCollapsed ? <Link to={buildPath('sharedProfile', { profileId: profile.id })} data-shared-profile-home="" aria-label={`Return to ${profile.name}'s profile landing page`} aria-current={activeCategoryId ? undefined : 'page'} className="group flex h-10 min-w-0 flex-1 items-center rounded-[10px] bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <span className={`cdx-dense-label min-w-0 flex-1 truncate text-[14px] font-semibold transition-colors duration-150 group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)] group-active:text-[var(--accent-text)] ${activeCategoryId ? 'text-[var(--text-primary)]' : 'text-[var(--accent-text)]'}`}>{profile.name}</span>
          </Link> : null}
          <button type="button" onClick={() => { setIsSettingsOpen(false); compactNavigation.toggle(); }} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!isCollapsed} aria-controls="shared-profile-portals" data-sidebar-toggle="" data-structural-toggle="" className="side-panel-header-control side-panel-header-icon shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={isCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size="sm" weight="medium" />
          </button>
        </div>
      </div>

      <nav id="shared-profile-portals" aria-label={`${profile.name} portals`} className={`min-h-0 flex-1 overflow-y-auto py-2 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        {isCollapsed ? <Link to={buildPath('sharedProfile', { profileId: profile.id })} data-shared-profile-home="" aria-label={`Return to ${profile.name}'s profile landing page`} title={`${profile.name} — Profile`} aria-current={activeCategoryId ? undefined : 'page'} className={`sidebar-rail-slot shape-compact mx-auto mb-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${activeCategoryId ? 'text-[var(--text-primary)] hover:text-[var(--accent-text)]' : 'text-[var(--accent-text)]'}`}>
            <InterfaceIcon icon={HomeIcon} weight="medium" />
          </Link> : null}
        <h2 className={isCollapsed ? 'sr-only' : 'relative my-2 flex h-7 w-full shrink-0 items-center'}>
          <span data-shared-portals-heading="" className="portals-heading flex h-full min-w-0 flex-1 items-center truncate bg-transparent pl-2 pr-2 text-left text-[14px] font-semibold text-[var(--text-tertiary)]">
            Portals
          </span>
        </h2>
        <ul className={`sidebar-pill-group m-0 flex list-none flex-col p-0 ${isCollapsed ? 'items-center' : ''}`}>
          {profile.categories.map((category) => {
          const Icon = getCategoryIcon(category.iconName);
          const isActive = category.id === activeCategoryId;
          return <li key={category.id} className={`side-panel-row group/row relative mb-[var(--side-panel-row-gap)] list-none ${isCollapsed ? 'w-10 shrink-0' : 'w-full'}`}>
                <button type="button" data-category-row="" onClick={() => { compactNavigation.closeCompact(); onOpenCategory(category.id); }} aria-label={category.label} title={category.label} aria-current={isActive ? 'page' : undefined} className={`ps-list-btn sidebar-pill-row flex h-full w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[180ms] ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isCollapsed ? 'justify-center' : ''} ${isActive ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
                  <span aria-hidden="true" data-icon-tile="" className="flex h-4 w-6 shrink-0 items-center justify-center">
                    <InterfaceIcon icon={Icon} weight="medium" />
                  </span>
                  {!isCollapsed ? <>
                    <span className="cdx-dense-label min-w-0 flex-1 truncate py-0.5" title={category.label}>{category.label}</span>
                    <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true" />
                  </> : null}
                </button>
              </li>;
        })}
        </ul>
      </nav>

      <div data-shared-account-footer="" className={`relative z-40 shrink-0 py-2 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        <div className={`relative flex items-center ${isCollapsed ? 'flex-col gap-1.5' : 'h-10 justify-between'}`}>
          {isSettingsOpen ? <div ref={settingsMenuRef} role="menu" aria-label="Portalink account options" data-shared-account-menu="" className={`account-menu-popover absolute bottom-full mb-2 overflow-hidden rounded-[12px] p-1.5 text-[var(--text-primary)] ${isCollapsed ? 'left-1 w-56 max-w-[calc(100vw-16px)]' : 'left-1 right-1'}`}>
              <button type="button" role="menuitem" onClick={() => openAuth(onCreateAccount)} className="account-menu-row side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center"><InterfaceIcon icon={UserPlusIcon} size="sm" weight="medium" /></span>
                <span className="whitespace-nowrap leading-none">Create an account</span>
              </button>
              <button type="button" role="menuitem" onClick={() => openAuth(onSignIn)} className="account-menu-row side-panel-primary-control side-panel-control-row w-full px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
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
      {!isCollapsed ? <ResizablePanelHandle side="right" value={sharedSidebarWidth.width} min={180} max={360} onResize={sharedSidebarWidth.updateWidth} onResizeEnd={sharedSidebarWidth.commitWidth} onReset={sharedSidebarWidth.resetWidth} label="Resize shared profile navigation. Double-click to restore the default width." /> : null}
    </aside>;
}
