import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3Icon, BookmarkIcon, CircleUserRoundIcon, HomeIcon, MessageCircleIcon, MoonIcon, PlayIcon, SatelliteDishIcon, SearchIcon, SunIcon, WarehouseIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { useNavigationSwipe } from './useNavigationSwipe';
import { useMobileDockScroll } from './useMobileDockScroll';
import { motion, useReducedMotion } from 'framer-motion';
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
};

function NavigationOrientationIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24">
    <rect x="3" y="6" width="18" height="2" rx="1" />
    <rect x="3" y="15" width="12" height="2" rx="1" />
  </svg>;
}

function Destination({ item, variant = 'rail' }: { item: Item; variant?: 'rail' | 'dock' | 'profile' }) {
  const shared = {
    className: `mobile-nav-destination nav-button ${variant === 'rail' ? 'shape-compact' : variant === 'profile' ? 'mobile-dock-profile' : 'mobile-dock-destination'}`,
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
export function MobileNavigation({ settings, theme, onThemeChange, onPortalink, onMessages, onProfile, profileHref, isProfileActive, liveControl }: Props) {
  const [hidden, setHidden] = useState(true);
  const reduceMotion = useReducedMotion();
  const { pathname } = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useMobileDockScroll(hidden, pathname, dockRef);
  function setNavigationHidden(next: boolean) {
    setHidden(next);
    requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true }));
  }
  function close() { setNavigationHidden(true); }
  function open() { setNavigationHidden(false); }
  const closeSwipe = useNavigationSwipe('left', close);
  const dockSwipe = useNavigationSwipe(hidden ? 'right' : 'left', hidden ? open : close);
  const messages: Item = { label: 'Messages', icon: MessageCircleIcon, action: onMessages, active: pathname === buildPath('messages') };
  const studio: Item = { label: 'Studio', icon: WarehouseIcon, disabled: true };
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
  return <div className="mobile-navigation-layer" data-mobile-navigation-layer="">
    <button type="button" className="mobile-navigation-dismiss" hidden={hidden} tabIndex={-1} aria-label="Close side navigation" onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    }} />
    <aside id="mobile-main-navigation" className="mobile-navigation sidebar-starfield" data-mobile-navigation="" data-hidden={hidden} aria-label="Portalink navigation" {...closeSwipe}>
      {!hidden && <>
        <nav className="mobile-navigation-scroll scrollbar-hidden" aria-label="Main destinations">
          <Destination item={{ label: theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance', icon: theme === 'dark' ? SunIcon : MoonIcon, action: () => onThemeChange(theme === 'dark' ? 'light' : 'dark') }} />
          {settings}
          {items.map(item => <Destination key={item.label} item={item} />)}
          {liveControl}
        </nav>
      </>}
    </aside>
    <div ref={dockRef} className="mobile-floating-navigation" {...dockSwipe}>
      <button ref={toggle} type="button" className="mobile-navigation-opener" aria-label={hidden ? 'Show navigation' : 'Hide navigation'} aria-expanded={!hidden} aria-controls="mobile-main-navigation" title={hidden ? 'Show navigation · swipe right' : 'Hide navigation · swipe left'} onClick={hidden ? open : close}><InterfaceIcon icon={NavigationOrientationIcon} fill="currentColor" stroke="none" /></button>
      <motion.nav hidden={!hidden} className="mobile-navigation-quick-links" aria-label="Quick navigation" initial={false} animate={{ opacity: hidden ? 1 : 0, y: reduceMotion || hidden ? 0 : 8 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
        <div className="mobile-navigation-dock">
          {[messages, home].map(item => <Destination key={item.label} item={item} variant="dock" />)}
        </div>
        <Destination item={profile} variant="profile" />
      </motion.nav>
    </div>
  </div>;
}
