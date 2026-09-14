import React, { Children, ReactNode } from 'react';
type HorizontalScrollRowProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  layout?: 'carousel' | 'grid';
};
export function HorizontalScrollRow({
  ariaLabel,
  children,
  className = '',
  contentClassName = '',
  layout = 'carousel'
}: HorizontalScrollRowProps) {
  const isCarousel = layout === 'carousel';
  const items = Children.toArray(children);
  const trackClassName = isCarousel ? `scrollbar-hidden flex snap-x snap-mandatory scroll-smooth overflow-x-auto overscroll-x-contain py-3 [-webkit-overflow-scrolling:touch] focus:outline-none [&>*]:snap-start [&>*]:snap-always ${contentClassName}` : `two-row-card-grid py-3 ${contentClassName}`;
  return <div className={`overflow-hidden ${className}`}>
      <div className={trackClassName} role="list" aria-label={ariaLabel}>
        <div aria-hidden="true" inert className="looping-copy contents">
          {items}
        </div>
        {items}
        <div aria-hidden="true" inert className="looping-copy contents">
          {items}
        </div>
      </div>
    </div>;
}