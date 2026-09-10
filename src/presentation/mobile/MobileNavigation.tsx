import React, { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3Icon, BellIcon, BookmarkIcon, CircleUserRoundIcon, HomeIcon, MessageCircleIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlayIcon, SatelliteDishIcon, SearchIcon, SunIcon, WarehouseIcon } from 'lucide-react';
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

function Destination({ item, dock = false }: { item: Item; dock?: boolean }) {
  const shared = {
    className: `mobile-nav-destination nav-button ${dock ? 'mobile-dock-destination' : 'shape-compact'}`,
    'aria-label': item.disabled ? `${item.label} unavailable` : item.label,
    'aria-current': item.active ? 'page' as const : undefined,
    title: item.disabled ? `${item.label} is not available yet` : item.label,
  };
  const content = <><InterfaceIcon icon={item.icon} weight="medium" />{dock && <span>{item.label}</span>}</>;
  return item.href && !item.disabled
    ? <Link {...shared} to={item.href}>{content}</Link>
    : <button {...shared} type="button" disabled={item.disabled} onClick={() => item.action?.()}>{content}</button>;
}

/** The phone rail has its own visibility, without writing the WEB width/choice. */
export function MobileNavigation({ settings, onAppearance, onPortalink, onMessages, onProfile, profileHref, isProfileActive, liveControl }: Props) {
  const [hidden, setHidden] = useState(false);
  const reduceMotion = useReducedMotion();
  const { pathname } = useLocation();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  function close() { setHidden(true); requestAnimationFrame(() => opener.current?.focus({ preventScroll: true })); }
  function open() { setHidden(false); requestAnimationFrame(() => closer.current?.focus({ preventScroll: true })); }
  const closeSwipe = useNavigationSwipe('left', close);
  const openSwipe = useNavigationSwipe('right', open);
  const messages: Item = { label: 'Messages', icon: MessageCircleIcon, action: onMessages, active: pathname === buildPath('messages') };
  const portals: Item = { label: 'Portals', icon: PortalRingIcon, disabled: true };
  const studio: Item = { label: 'Studio', icon: WarehouseIcon, disabled: true };
  const profile: Item = { label: 'Profile', icon: CircleUserRoundIcon, href: profileHref, action: onProfile, active: isProfileActive };
  const items: Item[] = [
    portals, studio,
    { label: 'Portalink', icon: SatelliteDishIcon, action: onPortalink, active: pathname.startsWith('/portalink') },
    messages,
    { label: 'Bookmarks', icon: BookmarkIcon, href: buildPath('saved'), active: pathname === buildPath('saved') },
    { label: 'Videos', icon: PlayIcon, disabled: true },
    { label: 'Posts', icon: HomeIcon, href: buildPath('home'), active: pathname === buildPath('home') },
    { label: 'Notifications', icon: BellIcon, href: buildPath('notifications'), active: pathname === buildPath('notifications') },
    { label: 'Analytics', icon: BarChart3Icon, href: buildPath('insights'), active: pathname === buildPath('insights') },
    { label: 'Search', icon: SearchIcon, disabled: true },
    profile,
  ];
  return <>
    <aside className="mobile-navigation sidebar-starfield" data-mobile-navigation="" data-hidden={hidden} aria-label="Portalink navigation" {...closeSwipe}>
      {!hidden && <>
        <button ref={closer} type="button" className="mobile-navigation-toggle" aria-label="Hide navigation" aria-expanded="true" aria-controls="mobile-main-navigation" title="Hide navigation · swipe left" onClick={close}><InterfaceIcon icon={PanelLeftCloseIcon} /></button>
        <nav id="mobile-main-navigation" className="mobile-navigation-scroll scrollbar-hidden" aria-label="Main destinations">
          <Destination item={{ label: 'Appearance', icon: SunIcon, action: onAppearance, active: pathname === buildPath('controlCenter') }} />
          {settings}
          {items.map(item => <Destination key={item.label} item={item} />)}
          {liveControl}
        </nav>
      </>}
    </aside>
    {hidden && <motion.div className="mobile-floating-navigation" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} {...openSwipe}>
      <button ref={opener} type="button" className="mobile-navigation-opener" aria-label="Show navigation" aria-expanded="false" aria-controls="mobile-main-navigation" title="Show navigation · swipe right" onClick={open}><InterfaceIcon icon={PanelLeftOpenIcon} /></button>
      <nav className="mobile-navigation-dock" aria-label="Quick navigation">
        {[messages, portals, studio, profile].map(item => <Destination key={item.label} item={item} dock />)}
      </nav>
    </motion.div>}
  </>;
}
