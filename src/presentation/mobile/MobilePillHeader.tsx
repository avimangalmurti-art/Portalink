import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMobileScreenActive } from './MobileBackNavigation';
import { ArrowLeftIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import './mobile-pill-header.css';
export type HeaderTab = { id: string; label: string; disabled?: boolean };
function centredPillOffset(left: number, width: number, railWidth: number) { return Math.max(0, left + width / 2 - railWidth / 2); }
export function MobilePillHeader({ label, tabs, active, onChange, onBack, right }: { label: string; tabs: HeaderTab[]; active: string; onChange: (id: string) => void; onBack?: () => void; right?: React.ReactNode }) {
  const activeScreen=useMobileScreenActive();
  const rail = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    const centre = () => {
      element.style.setProperty('--pill-rail-half', `${element.clientWidth / 2}px`);
      const selected = element.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (selected) element.scrollLeft = centredPillOffset(selected.offsetLeft, selected.offsetWidth, element.clientWidth);
    };
    centre();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(centre);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [active, tabs, activeScreen]);
  if(!activeScreen)return null;
  const header = <header data-mobile-pill-header={label} className="mobile-pill-header" aria-label={`${label} header`}>
    {onBack && <div className="mobile-pill-header-left"><button type="button" aria-label={`Back from ${label}`} onClick={onBack}><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button></div>}
    <nav ref={rail} className="mobile-pill-header-rail scrollbar-hidden" aria-label={`${label} tabs`}><div className="mobile-pill-header-tabs">{tabs.map(tab => <button key={tab.id} data-header-pill={tab.id} type="button" aria-pressed={active === tab.id} disabled={tab.disabled} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div></nav>
    <div className="mobile-pill-header-right" data-inline-screen-actions="">{right}</div>
  </header>;
  const host=typeof document==='undefined'?null:document.querySelector('.codex-shell');
  return host?createPortal(header,host):header;
}
