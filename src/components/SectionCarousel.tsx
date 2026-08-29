import React, { Children, ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { InterfaceIcon } from './ui/InterfaceIcon';
type SectionCarouselProps = {
  id: string;
  title: string;
  ariaLabel: string;
  children: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  detail?: ReactNode;
  className?: string;
  contentClassName?: string;
};
export function SectionCarousel({
  id,
  title,
  ariaLabel,
  children,
  eyebrow,
  subtitle,
  detail,
  className = '',
  contentClassName = ''
}: SectionCarouselProps) {
  const items = Children.toArray(children);
  function scrollRow(direction: 'back' | 'forward') {
    const row = document.getElementById(`${id}-track`);
    if (!row) {
      return;
    }
    row.scrollBy({
      left: (direction === 'back' ? -1 : 1) * row.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
  const actions = <div className="section-header-controls flex items-center gap-2" aria-label={`${ariaLabel} navigation`}>
      <button type="button" onClick={() => scrollRow('back')} aria-label={`Previous ${ariaLabel}`} className="shape-compact flex h-8 w-8 items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <InterfaceIcon icon={ChevronLeftIcon} weight="medium" mirroredInRtl />
      </button>
      <button type="button" onClick={() => scrollRow('forward')} aria-label={`Next ${ariaLabel}`} className="shape-compact flex h-8 w-8 items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <InterfaceIcon icon={ChevronRightIcon} weight="medium" mirroredInRtl />
      </button>
    </div>;
  return <section className={`min-w-0 ${className}`} aria-labelledby={id}>
      <SectionHeader id={id} title={title} eyebrow={eyebrow} subtitle={subtitle} detail={detail} actions={actions} />
      <div className="min-w-0 overflow-hidden">
        <div id={`${id}-track`} className={`scrollbar-hidden mt-5 flex snap-x snap-mandatory scroll-smooth overflow-x-auto overscroll-x-contain py-3 [-webkit-overflow-scrolling:touch] focus:outline-none [&>*]:snap-start [&>*]:snap-always ${contentClassName}`} role="list" aria-label={ariaLabel}>
          <div aria-hidden="true" inert className="looping-copy contents">
            {items}
          </div>
          {items}
          <div aria-hidden="true" inert className="looping-copy contents">
            {items}
          </div>
        </div>
      </div>
    </section>;
}
