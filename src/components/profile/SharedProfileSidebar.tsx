import { useCompactNavigation } from '../../hooks/useCompactNavigation';
import React, { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, LayoutGridIcon, ListIcon, MoonIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SettingsIcon, SunIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import type { Profile } from '../../types/domain';
import type { AppearanceTheme } from '../../utils/appearancePreferences';
import { buildPath } from '../../app/routes';
import { useResizablePanelWidth } from '../ui/ResizablePanelHandle';
import { panelLayoutDefaults, PANEL_LAYOUT_RESET_EVENT } from '../../utils/panelLayoutDefaults';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobilePortalScrollFade } from '../../presentation/mobile/useMobilePortalScrollFade';
import { PublicProfileDrawer } from '../../visitor/mobile/PublicProfileDrawer';
import { portalChildren, portalRootId } from '../../features/profile/portalHierarchy';

type SharedProfileSidebarProps = {
  profile: Profile;
  mobileNavigationEnabled?: boolean;
  mobileNavigationRequest?: object;
  useMobileHeaderOpener?: boolean;
  activeCategoryId: string | null;
  theme: AppearanceTheme;
  desktopNavigationStyle?: React.CSSProperties;
  onThemeChange: (theme: AppearanceTheme) => void;
  onOpenCategory: (categoryId: string) => void;
  onSettingsOpen: () => void;
};

/**
 * The shell used by a shared profile URL. It deliberately contains only the
 * creator and their public Portal navigation: no Home, account, messaging,
 * network, publishing, following, or platform-discovery controls. Visitors can
 * sign in or create a Portalink account in Settings.
 */
export function SharedProfileSidebar({
  profile,
  mobileNavigationEnabled = true,
  mobileNavigationRequest,
  useMobileHeaderOpener,
  activeCategoryId,
  theme,
  desktopNavigationStyle,
  onThemeChange,
  onOpenCategory,
  onSettingsOpen
}: SharedProfileSidebarProps) {
  const isMobile = usePresentation() === 'mobile';
  const rootPortals = portalChildren(profile.categories);
  const activeRootId = portalRootId(profile.categories, activeCategoryId);
  const sharedSidebarWidth = useResizablePanelWidth({
    // Public viewing keeps its own resize choice, with the same navigation default.
    id: 'shared-profile-navigation-standard',
    defaultWidth: panelLayoutDefaults.navigation,
    minWidth: 180,
    maxWidth: 360,
    viewportReserve: 320
  });
  // This is the public viewer's visit, not the owner's saved workspace layout.
  // Preserve the choice between shared routes.
  const [preferredCollapsed, setIsCollapsed] = useState(false);
  const [portalLayout, setPortalLayout] = useState<'list' | 'grid'>('list');
  const portalScrollRef = useMobilePortalScrollFade<HTMLElement>();
  useEffect(() => {
    const reset = () => setIsCollapsed(false);
    window.addEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
    return () => window.removeEventListener(PANEL_LAYOUT_RESET_EVENT, reset);
  }, []);
  const compactNavigation = useCompactNavigation(preferredCollapsed, setIsCollapsed);
  const isCollapsed = !isMobile && compactNavigation.collapsed;
  const sidebarStyle = isMobile ? undefined : isCollapsed ? desktopNavigationStyle : { ...desktopNavigationStyle, width: `${sharedSidebarWidth.width}px` };
  const toggleLabel = isMobile ? 'Close profile navigation' : isCollapsed ? 'Expand navigation' : 'Collapse navigation';
  const renderSidebar = (closeDrawer?: () => void) => <aside data-mobile-shared-sidebar={isMobile || undefined} data-resizable-panel="" data-collapsed={isCollapsed ? 'true' : 'false'} style={sidebarStyle} aria-label={`${profile.name} shared profile navigation`} className={`shared-profile-sidebar sidebar-starfield relative flex h-full min-h-0 shrink-0 flex-col bg-transparent transition-[width] duration-[var(--m-fast)] motion-reduce:transition-none ${isCollapsed ? 'w-[48px] sm:w-[52px]' : ''}`}>
      <div data-shared-navigation-header="" className={`global-control-header shrink-0 ${isCollapsed ? 'justify-center' : 'px-2'}`}>
        <div data-shared-navigation-row="" className={`flex h-full w-full min-w-0 flex-1 items-center ${isCollapsed ? 'justify-center' : 'side-panel-control-row'}`}>
          {!isCollapsed ? <Link onClick={closeDrawer} to={buildPath('sharedProfile', { profileId: profile.id })} data-shared-profile-home="" aria-label={`Return to ${profile.name}'s profile landing page`} aria-current={activeCategoryId ? undefined : 'page'} className="group flex h-10 min-w-0 flex-1 items-center rounded-[10px] bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <span className={`cdx-dense-label min-w-0 flex-1 truncate text-[14px] font-semibold transition-colors duration-[var(--m-fast)] group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)] group-active:text-[var(--accent-text)] ${activeCategoryId ? 'text-[var(--text-primary)]' : 'text-[var(--accent-text)]'}`}>{profile.name}</span>
          </Link> : null}
          {!isMobile && <button type="button" onClick={() => { if (closeDrawer) closeDrawer(); else compactNavigation.toggle(); }} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!isCollapsed} aria-controls="shared-profile-portals" data-sidebar-toggle="" data-structural-toggle="" className="side-panel-header-control side-panel-header-icon shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={isCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size="sm" weight="medium" />
          </button>}
        </div>
      </div>

      <nav id="shared-profile-portals" aria-label={`${profile.name} portals`} className={`min-h-0 flex-1 overflow-y-auto py-2 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        <h2 className={isCollapsed ? 'sr-only' : 'relative my-2 flex h-7 w-full shrink-0 items-center'}>
          <span data-shared-portals-heading="" className="portals-heading flex h-full min-w-0 flex-1 items-center truncate bg-transparent pl-2 pr-2 text-left text-inherit text-[var(--text-tertiary)]">
            Portals
          </span>
        </h2>
        <ul className={`sidebar-pill-group m-0 flex list-none flex-col p-0 ${isCollapsed ? 'items-center' : ''}`}>
          {rootPortals.map((category) => {
          const Icon = getCategoryIcon(category.iconName);
          const isActive = category.id === activeCategoryId;
          const isActiveBranch = category.id === activeRootId;
          return <li key={category.id} className={`side-panel-row group/row relative mb-[var(--side-panel-row-gap)] list-none ${isCollapsed ? 'w-10 shrink-0' : 'w-full'}`}>
                <button type="button" data-category-row="" onClick={() => { closeDrawer?.(); compactNavigation.closeCompact(); onOpenCategory(category.id); }} aria-label={category.label} title={category.label} aria-current={isActive ? 'page' : undefined} className={`ps-list-btn sidebar-pill-row flex h-full w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[var(--m-base)]  ease-[var(--m-enter)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isCollapsed ? 'justify-center' : ''} ${isActiveBranch ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
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

      <div data-shared-account-footer="" className={`relative z-40 shrink-0 border-t border-[var(--hairline)] py-2 ${isCollapsed ? 'px-0' : 'px-2'}`}>
        <div className={`relative items-center ${isCollapsed ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-[var(--side-panel-row-gap)]'}`}>
          <button type="button" onClick={() => { closeDrawer?.(); onSettingsOpen(); }} aria-label="Open settings" className={`nav-button ${isCollapsed ? 'sidebar-rail-slot' : 'sidebar-primary-control'} shape-compact flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>
            <InterfaceIcon icon={SettingsIcon} size="sm" weight="medium" />
            {isMobile && <span>Settings</span>}
          </button>
          <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch shared Portalink to light mode' : 'Switch shared Portalink to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} data-system-color="" className={`shared-profile-theme-toggle nav-button ${isCollapsed ? 'sidebar-rail-slot' : 'sidebar-primary-control'} shape-compact flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-[var(--m-fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}>
            {theme === 'dark' ? <InterfaceIcon icon={SunIcon} size="sm" weight="medium" /> : <InterfaceIcon icon={MoonIcon} size="sm" weight="medium" />}
            {isMobile && <span>Appearance</span>}
          </button>
        </div>
      </div>
    </aside>;
  return isMobile ? <PublicProfileDrawer name={profile.name} enabled={mobileNavigationEnabled} openRequest={mobileNavigationRequest} hideFloatingOpener={useMobileHeaderOpener}>{close => <section className="mobile-portals-page shared-mobile-portals" data-portals-layout={portalLayout} aria-label={`${profile.name} portals`}>
    <header className="global-control-header shrink-0 gap-2 px-4">
      <button type="button" aria-label="Go back" className="mobile-portal-action" onClick={close}><InterfaceIcon icon={ChevronLeftIcon} size="lg" mirroredInRtl /></button>
      <h1 className="min-w-0 flex-1 truncate text-[20px] font-semibold">Portals</h1>
      <div className="flex shrink-0 items-center">
        <button type="button" className="mobile-portal-action" aria-label="Open settings" title="Settings" onClick={() => { close(); onSettingsOpen(); }}>
          <InterfaceIcon icon={SettingsIcon} size="lg" />
        </button>
        <button type="button" className="mobile-portal-action" data-system-color="" aria-label={theme === 'dark' ? 'Switch shared Portalink to light mode' : 'Switch shared Portalink to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}>
          <InterfaceIcon icon={theme === 'dark' ? SunIcon : MoonIcon} size="lg" />
        </button>
        <button type="button" className="mobile-portal-action" aria-label={portalLayout === 'list' ? 'Show portals as cards' : 'Show portals as list'} onClick={() => setPortalLayout(value => value === 'list' ? 'grid' : 'list')}>
          <InterfaceIcon icon={portalLayout === 'list' ? LayoutGridIcon : ListIcon} size="lg" />
        </button>
      </div>
    </header>
    <nav ref={portalScrollRef} className="mobile-portals-scroll scrollbar-overlay sidebar-scroll-fade is-at-top is-at-bottom" aria-label={`${profile.name} public portals`}>
      <ul className="mobile-portals-list">
        {rootPortals.map(category => <li key={category.id} className="mobile-portal-item"><button type="button" data-category-row="" className="mobile-portal-row" aria-current={category.id === activeCategoryId ? 'page' : undefined} onClick={() => { close(); onOpenCategory(category.id); }}>
          <InterfaceIcon icon={getCategoryIcon(category.iconName)} size="lg" weight="medium" /><span className="mobile-portal-label">{category.label}</span><InterfaceIcon icon={ChevronRightIcon} size="sm" className="text-[var(--text-tertiary)]" />
        </button></li>)}
      </ul>
      {!rootPortals.length && <p className="p-4 text-[var(--text-secondary)]">No portals yet</p>}
    </nav>
  </section>}</PublicProfileDrawer> : renderSidebar();
}
