import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3Icon, BookmarkIcon, CircleUserRoundIcon, HomeIcon, MessageCircleIcon, MoonIcon, PlayIcon, PlusIcon, SatelliteDishIcon, SearchIcon, SunIcon, WarehouseIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { useNavigationSwipe } from './useNavigationSwipe';
import { useMobileDockScroll } from './useMobileDockScroll';
import { useNavigationOutsideTap } from './useNavigationOutsideTap';
import type { AppearanceTheme } from '../../utils/appearancePreferences';

type Item = { label: string; icon: InterfaceIconSource; href?: string; action?: () => void; active?: boolean; disabled?: boolean; mirroredInRtl?: boolean };
type Props = {
  settings: React.ReactNode;
  theme: AppearanceTheme;
  onThemeChange: (theme: AppearanceTheme) => void;
  onPortalink: () => void;
  onMessages: () => void;
  onProfile: () => void;
  profileHref?: string;
  isProfileActive: boolean;
  liveControl?: React.ReactNode;
  onCreateProject?: () => void;
};

function NavigationOrientationIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24">
    <rect x="3" y="6" width="18" height="2" rx="1" />
    <rect x="3" y="15" width="12" height="2" rx="1" />
  </svg>;
}

function Destination({ item, variant = 'rail' }: { item: Item; variant?: 'rail' | 'dock' }) {
  const shared = {
    className: `mobile-nav-destination nav-button ${variant === 'rail' ? 'shape-compact' : 'mobile-dock-destination'}`,
    'aria-label': item.disabled ? `${item.label} unavailable` : item.label,
    'aria-current': item.active ? 'page' as const : undefined,
    title: item.disabled ? `${item.label} is not available yet` : item.label,
  };
  const content = <InterfaceIcon icon={item.icon} weight="medium" mirroredInRtl={item.mirroredInRtl} />;
  return item.href && !item.disabled
    ? <Link {...shared} to={item.href}>{content}</Link>
    : <button {...shared} type="button" disabled={item.disabled} onClick={() => item.action?.()}>{content}</button>;
}

/** The phone rail has its own visibility, without writing the WEB width/choice. */
export function MobileNavigation({ settings, theme, onThemeChange, onPortalink, onMessages, onProfile, profileHref, isProfileActive, liveControl, onCreateProject }: Props) {
  const [hidden, setHidden] = useState(true);
  const { pathname, search } = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  useMobileDockScroll(hidden, pathname, dockRef);
  function setNavigationHidden(next: boolean) {
    setHidden(next);
    requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }));
  }
  function close() { setNavigationHidden(true); }
  function open() { setNavigationHidden(false); }
  // An outside gesture keeps its own focus (especially a tapped form field).
  useNavigationOutsideTap(!hidden, layerRef, () => setHidden(true));
  // The destination owns focus after navigation, including query-only changes.
  useEffect(() => setHidden(true), [pathname, search]);
  useEffect(() => {
    if (hidden) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element && !layerRef.current?.contains(target) && target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      event.preventDefault();
      setHidden(true);
      if (layerRef.current?.contains(document.activeElement)) toggle.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [hidden]);
  const closeSwipe = useNavigationSwipe('left', close);
  const dockSwipe = useNavigationSwipe(hidden ? 'right' : 'left', hidden ? open : close);
  const messages: Item = { label: 'Messages', icon: MessageCircleIcon, action: onMessages, active: pathname === buildPath('messages') };
  const studio: Item = { label: 'Studio', icon: WarehouseIcon, href: buildPath('studio'), active: pathname === buildPath('studio') || pathname === buildPath('saved') };
  const profile: Item = { label: 'Profile', icon: CircleUserRoundIcon, href: profileHref, action: onProfile, active: isProfileActive };
  const home: Item = { label: 'Home', icon: HomeIcon, href: buildPath('home'), active: pathname === buildPath('home') };
  const items: Item[] = [
    { label: 'Analytics', icon: BarChart3Icon, href: buildPath('insights'), active: pathname === buildPath('insights') },
    { label: 'Bookmarks', icon: BookmarkIcon, href: buildPath('saved'), active: pathname === buildPath('saved') },
    { label: 'Portalink', icon: SatelliteDishIcon, action: onPortalink, active: pathname.startsWith('/portalink') },
    { label: 'Search', icon: SearchIcon, disabled: true },
    { label: 'Videos', icon: PlayIcon, disabled: true },
    studio,
    messages,
    home,
    profile,
  ];
  return <div ref={layerRef} className="mobile-navigation-layer" data-mobile-navigation-layer="">
    <aside id="mobile-main-navigation" className="mobile-navigation sidebar-starfield" data-mobile-navigation="" data-hidden={hidden} aria-label="Portalink navigation" {...closeSwipe}>
      {!hidden && <>
        <nav className="mobile-navigation-scroll scrollbar-hidden" aria-label="Main destinations">
          {liveControl}
          {[...items].reverse().map(item => <Destination key={item.label} item={item} />)}
          {settings}
          <Destination item={{ label: theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance', icon: theme === 'dark' ? SunIcon : MoonIcon, action: () => onThemeChange(theme === 'dark' ? 'light' : 'dark') }} />
        </nav>
      </>}
    </aside>
    <div ref={dockRef} className="mobile-floating-navigation">
      <nav className="mobile-navigation-quick-links" aria-label="Quick navigation" {...dockSwipe}>
        <div className="mobile-navigation-dock">
          <button ref={toggle} type="button" className="mobile-navigation-opener mobile-dock-destination nav-button" aria-label={hidden ? 'Show navigation' : 'Hide navigation'} aria-expanded={!hidden} aria-controls="mobile-main-navigation" title={hidden ? 'Show navigation · swipe right' : 'Hide navigation · swipe left'} onClick={hidden ? open : close}><InterfaceIcon icon={NavigationOrientationIcon} fill="currentColor" stroke="none" /></button>
          {[messages, studio, home, profile].map(item => <Destination key={item.label} item={item} variant="dock" />)}
        </div>
      </nav>
      {onCreateProject && <button type="button" className="mobile-navigation-compose" data-keep-color="" aria-label="New project" title="New project" onClick={onCreateProject}><InterfaceIcon icon={PlusIcon} /></button>}
    </div>
  </div>;
}
