import React, { ReactNode, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { InfiniteTwoRowGrid } from './InfiniteTwoRowGrid';
import { SectionHeader } from './SectionHeader';
import { InterfaceIcon } from './ui/InterfaceIcon';
type SectionLoopRowProps = {
  id: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  detail?: ReactNode;
  className?: string;
  trackClassName?: string;
  compact?: boolean;
  stickyHeader?: boolean;
};
export function SectionLoopRow({
  id,
  title,
  ariaLabel,
  children,
  eyebrow,
  subtitle,
  detail,
  className = '',
  trackClassName = '',
  compact = false,
  stickyHeader = false
}: SectionLoopRowProps) {
  const trackContainerRef = useRef<HTMLDivElement>(null);
  function scrollTrack(direction: 'back' | 'forward') {
    const track = trackContainerRef.current?.querySelector<HTMLDivElement>('[role="list"]');
    if (!track) {
      return;
    }
    track.scrollBy({
      left: (direction === 'back' ? -1 : 1) * track.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
  const actions = <div className="section-header-controls flex items-center gap-2" aria-label={`${ariaLabel} navigation`}>
      <button type="button" onClick={() => scrollTrack('back')} aria-label={`Previous ${ariaLabel}`} className="shape-compact flex h-8 w-8 items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
      </button>
      <button type="button" onClick={() => scrollTrack('forward')} aria-label={`Next ${ariaLabel}`} className="shape-compact flex h-8 w-8 items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <InterfaceIcon icon={ChevronRightIcon} weight="medium" mirroredInRtl />
      </button>
    </div>;
  return <section className={`min-w-0 ${className}`} aria-labelledby={id}>
      <SectionHeader id={id} title={title} eyebrow={eyebrow} subtitle={subtitle} detail={detail} actions={actions} className={stickyHeader ? 'sticky-section-nav' : ''} />
      <div ref={trackContainerRef} className="min-w-0 overflow-hidden">
        <InfiniteTwoRowGrid ariaLabel={ariaLabel} className={`mt-3.5 ${trackClassName}`} compact={compact}>
          {children}
        </InfiniteTwoRowGrid>
      </div>
    </section>;
}
