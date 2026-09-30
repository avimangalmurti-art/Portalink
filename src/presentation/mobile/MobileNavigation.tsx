import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CircleUserRoundIcon, HomeIcon, MessageCircleIcon, SatelliteDishIcon, WarehouseIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { useMobileDockScroll } from './useMobileDockScroll';
import { MobileContextButton, useMobileActions } from './MobileContextActions';

type Item = { label: string; icon: InterfaceIconSource; href?: string; action?: () => void; active?: boolean };
type Props = { onPortalink: () => void; onMessages: () => void; onProfile: () => void; profileHref?: string; isProfileActive: boolean };
function Destination({ item }: { item: Item }) {
  const props = { className: 'mobile-nav-destination nav-button mobile-dock-destination', 'aria-label': item.label, 'aria-current': item.active ? 'page' as const : undefined, title: item.label };
  const icon = <InterfaceIcon icon={item.icon} weight="medium" />;
  return item.href ? <Link {...props} to={item.href}>{icon}</Link> : <button {...props} type="button" onClick={item.action}>{icon}</button>;
}
/** Screen actions and five stable destinations share one viewport-fixed capsule. */
export function MobileNavigation({ onPortalink, onMessages, onProfile, profileHref, isProfileActive }: Props) {
  const { pathname } = useLocation();
  const actions = useMobileActions();
  const dockRef = useRef<HTMLDivElement>(null);
  useMobileDockScroll(!actions?.opened, pathname, dockRef);
  const destinations: Item[] = [
    { label: 'Messages', icon: MessageCircleIcon, action: onMessages, active: pathname === buildPath('messages') },
    { label: 'Studio', icon: WarehouseIcon, href: buildPath('studio'), active: pathname === buildPath('studio') || pathname === buildPath('saved') },
    { label: 'Home', icon: HomeIcon, href: buildPath('home'), active: pathname === buildPath('home') },
    { label: 'Profile', icon: CircleUserRoundIcon, href: profileHref, action: onProfile, active: isProfileActive },
    { label: 'Explore', icon: SatelliteDishIcon, action: onPortalink, active: pathname.startsWith('/portalink') || pathname === buildPath('search') },
  ];
  return <div className="mobile-navigation-layer" data-mobile-navigation-layer=""><div ref={dockRef} className="mobile-floating-navigation"><nav className="mobile-navigation-quick-links" aria-label="Quick navigation"><div className="mobile-navigation-dock"><MobileContextButton />{destinations.map(item => <Destination key={item.label} item={item}/>)}</div></nav></div></div>;
}
