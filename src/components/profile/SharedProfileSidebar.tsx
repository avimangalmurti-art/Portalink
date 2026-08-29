import React from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { Button } from '../ui/Button';
import type { Profile } from '../../types/domain';
import type { AppearanceTheme } from '../../utils/appearancePreferences';

type SharedProfileSidebarProps = {
  profile: Profile;
  activeCategoryId: string | null;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onJoin: () => void;
  onOpenProfile: () => void;
  onOpenCategory: (categoryId: string) => void;
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
  onJoin,
  onOpenProfile,
  onOpenCategory
}: SharedProfileSidebarProps) {
  const projectCount = profile.projects.length;
  return <aside aria-label={`${profile.name} shared profile navigation`} className="shared-profile-sidebar sidebar-starfield flex h-full w-[208px] shrink-0 flex-col bg-transparent lg:w-[216px] 2xl:w-[224px]">
      <div className="global-control-header shrink-0 px-2">
        <div className="flex h-full w-full min-w-0 flex-1 items-center justify-between gap-2 px-2">
          <span data-shared-header-title="" className="flex min-w-0 flex-col text-[16px] font-bold leading-[1.05] text-[var(--text-secondary)]">
            <span className="block truncate">Portalink</span>
            <span className="block truncate">Networks</span>
          </span>
          <span data-shared-project-count="" className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-[var(--text-primary)]">{projectCount} {projectCount === 1 ? 'project' : 'projects'}</span>
          <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch shared Portalink to light mode' : 'Switch shared Portalink to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'} data-system-color="" className="shared-profile-theme-toggle side-panel-compact-control shape-compact flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {theme === 'dark' ? <InterfaceIcon icon={SunIcon} size="sm" weight="medium" /> : <InterfaceIcon icon={MoonIcon} size="sm" weight="medium" />}
          </button>
        </div>
      </div>

      <nav aria-label={possessivePortals(profile.name)} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <h2 className="relative my-2 flex h-7 w-full shrink-0 items-center">
          <button type="button" data-keep-color="" data-shared-portals-heading="" onClick={onOpenProfile} aria-label={`Open ${profile.name}'s shared profile`} className="portals-heading flex h-full min-w-0 flex-1 items-center truncate bg-transparent pl-2 pr-2 text-left text-[14px] font-semibold text-[var(--text-tertiary)] transition-colors duration-150 hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
            {possessivePortals(profile.name)}
          </button>
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

      <div data-shared-join-footer="" className="shrink-0 px-3 pb-3 pt-2">
        <Button variant="primary" size="md" fullWidth onClick={onJoin}>
          Join the Portalink Network
        </Button>
      </div>
    </aside>;
}
