import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDaysIcon, CircleUserRoundIcon, SearchIcon, MessageCircleIcon, WarehouseIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { useMobileDockScroll } from './useMobileDockScroll';
import { useMobileActions } from './MobileContextActions';

type Item = { label: string; icon: InterfaceIconSource; href?: string; action?: () => void; active?: boolean };
type Props = { onMessages: (fromDock?: boolean) => void; onSoCal: () => void; isSoCalActive: boolean; onProfile: () => void; profileHref?: string; isProfileActive: boolean };
function Destination({ item }: { item: Item }) {
  const props = { className: 'mobile-nav-destination nav-button mobile-dock-destination', 'aria-label': item.label, 'aria-current': item.active ? 'page' as const : undefined, title: item.label };
  const icon = <InterfaceIcon icon={item.icon} weight="medium" />;
  return item.href ? <Link {...props} to={item.href} state={item.label === 'Profile' ? { profileFromDock: true, dockEntry: 'profile' } : item.label === 'Studio' ? { dockEntry: 'studio' } : undefined}>{icon}</Link> : <button {...props} type="button" onClick={() => item.action?.()}>{icon}</button>;
}
/** Five stable destinations share one viewport-fixed capsule. */
export function MobileNavigation({ onMessages, onSoCal, isSoCalActive, onProfile, profileHref, isProfileActive }: Props) {
  const { pathname } = useLocation();
  const actions = useMobileActions();
  const dockRef = useRef<HTMLDivElement>(null);
  useMobileDockScroll(!actions?.opened, pathname, dockRef);
  const destinations: Item[] = [
    { label: 'Explore', icon: SearchIcon, href: buildPath('home'), active: pathname === buildPath('home') || pathname === buildPath('portalSearch') },
    { label: 'Messages', icon: MessageCircleIcon, action: () => onMessages(true), active: pathname === buildPath('messages') },
    { label: 'SoCal', icon: CalendarDaysIcon, action: onSoCal, active: isSoCalActive },
    { label: 'Studio', icon: WarehouseIcon, href: buildPath('studio'), active: pathname === buildPath('studio') || pathname === buildPath('saved') },
    { label: 'Profile', icon: CircleUserRoundIcon, href: profileHref, action: onProfile, active: isProfileActive },
  ];
  return <div className="mobile-navigation-layer" data-mobile-navigation-layer=""><div ref={dockRef} className="mobile-floating-navigation"><nav className="mobile-navigation-quick-links" aria-label="Quick navigation"><div className="mobile-navigation-dock">{destinations.map(item => <Destination key={item.label} item={item}/>)}</div></nav></div></div>;
}
