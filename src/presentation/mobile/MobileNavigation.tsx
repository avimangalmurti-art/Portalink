import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3Icon, BellIcon, BookmarkIcon, CircleUserRoundIcon, HomeIcon, MessageCircleIcon, PanelLeftCloseIcon, PlayIcon, PlusIcon, SatelliteDishIcon, SearchIcon, SunIcon, WarehouseIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { PortalRingIcon } from '../../components/PortalRingIcon';
import { useNavigationSwipe } from './useNavigationSwipe';
import { motion, useReducedMotion } from 'framer-motion';

type Item = { label: string; icon: InterfaceIconSource; href?: string; action?: () => void; active?: boolean; disabled?: boolean };
type Props = {
  settings: React.ReactNode;
  onAppearance: () => void;
  onPortalink: () => void;
  onMessages: () => void;
  onProfile: () => void;
  profileHref?: string;
  isProfileActive: boolean;
  liveControl?: React.ReactNode;
};

function Destination({ item, variant = 'rail' }: { item: Item; variant?: 'rail' | 'dock' | 'profile' }) {
  const shared = {
    className: `mobile-nav-destination nav-button ${variant === 'rail' ? 'shape-compact' : variant === 'profile' ? 'mobile-dock-profile' : 'mobile-dock-destination'}`,
    'aria-label': item.disabled ? `${item.label} unavailable` : item.label,
    'aria-current': item.active ? 'page' as const : undefined,
    title: item.disabled ? `${item.label} is not available yet` : item.label,
  };
  const content = <InterfaceIcon icon={item.icon} weight="medium" />;
  return item.href && !item.disabled
    ? <Link {...shared} to={item.href}>{content}</Link>
    : <button {...shared} type="button" disabled={item.disabled} onClick={() => item.action?.()}>{content}</button>;
}

/** The phone rail has its own visibility, without writing the WEB width/choice. */
export function MobileNavigation({ settings, onAppearance, onPortalink, onMessages, onProfile, profileHref, isProfileActive, liveControl }: Props) {
  const [hidden, setHidden] = useState(false);
  const reduceMotion = useReducedMotion();
  const { pathname } = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  const railToggle = useRef<HTMLButtonElement>(null);
  function close() { setHidden(true); requestAnimationFrame(() => toggle.current?.focus({ preventScroll: true })); }
  // The close control sits after Profile; let the rail reveal it on short screens.
  function open() { setHidden(false); requestAnimationFrame(() => railToggle.current?.focus({ preventScroll: false })); }
  const closeSwipe = useNavigationSwipe('left', close);
  const dockSwipe = useNavigationSwipe(hidden ? 'right' : 'left', hidden ? open : close);
  const messages: Item = { label: 'Messages', icon: MessageCircleIcon, action: onMessages, active: pathname === buildPath('messages') };
  const portals: Item = { label: 'Portals', icon: PortalRingIcon, disabled: true };
  const studio: Item = { label: 'Studio', icon: WarehouseIcon, disabled: true };
  const profile: Item = { label: 'Profile', icon: CircleUserRoundIcon, href: profileHref, action: onProfile, active: isProfileActive };
  const home: Item = { label: 'Home', icon: HomeIcon, href: buildPath('home'), active: pathname === buildPath('home') };
  const items: Item[] = [
    portals, studio,
    { label: 'Portalink', icon: SatelliteDishIcon, action: onPortalink, active: pathname.startsWith('/portalink') },
    messages,
    { label: 'Bookmarks', icon: BookmarkIcon, href: buildPath('saved'), active: pathname === buildPath('saved') },
    { label: 'Videos', icon: PlayIcon, disabled: true },
    { ...home, label: 'Posts' },
    { label: 'Notifications', icon: BellIcon, href: buildPath('notifications'), active: pathname === buildPath('notifications') },
    { label: 'Analytics', icon: BarChart3Icon, href: buildPath('insights'), active: pathname === buildPath('insights') },
    { label: 'Search', icon: SearchIcon, disabled: true },
    profile,
  ];
  return <>
    <aside id="mobile-main-navigation" className="mobile-navigation sidebar-starfield" data-mobile-navigation="" data-hidden={hidden} aria-label="Portalink navigation" {...closeSwipe}>
      {!hidden && <>
        <nav className="mobile-navigation-scroll scrollbar-hidden" aria-label="Main destinations">
          <Destination item={{ label: 'Appearance', icon: SunIcon, action: onAppearance, active: pathname === buildPath('controlCenter') }} />
          {settings}
          {items.map(item => <Destination key={item.label} item={item} />)}
          <button ref={railToggle} type="button" className="mobile-navigation-toggle mobile-nav-destination nav-button shape-compact" aria-label="Hide navigation" aria-expanded="true" aria-controls="mobile-main-navigation" title="Hide navigation · swipe left" onClick={close}><InterfaceIcon icon={PanelLeftCloseIcon} weight="medium" /></button>
          {liveControl}
        </nav>
      </>}
    </aside>
    <motion.nav hidden={!hidden} className="mobile-floating-navigation" aria-label="Quick navigation" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} {...dockSwipe}>
      <button ref={toggle} type="button" className="mobile-navigation-opener" aria-label={hidden ? 'Show navigation' : 'Hide navigation'} aria-expanded={!hidden} aria-controls="mobile-main-navigation" title={hidden ? 'Show navigation · swipe right' : 'Hide navigation · swipe left'} onClick={hidden ? open : close}><InterfaceIcon icon={PlusIcon} /></button>
      <div className="mobile-navigation-dock">
        {[messages, portals, studio, home].map(item => <Destination key={item.label} item={item} variant="dock" />)}
      </div>
      <Destination item={profile} variant="profile" />
    </motion.nav>
  </>;
}
