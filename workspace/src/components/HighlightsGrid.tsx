import React from 'react';
import type { FeatureCardApp } from './FeatureCard';
import { SectionLoopRow } from './SectionLoopRow';
import { getItemPrice } from './pricing';
export type Highlight = {
  title: string;
  subtitle: string;
  eyebrow: string;
  image: string;
  imageAlt: string;
  icon: string;
  appName: string;
  appTagline: string;
  footerClassName: string;
  overlayClassName: string;
  size: 'wide' | 'standard';
  badge?: string;
};
type HighlightsGridProps = {
  highlights: Highlight[];
  onView: (app: FeatureCardApp) => void;
};
export function HighlightsGrid({
  highlights,
  onView
}: HighlightsGridProps) {
  return <SectionLoopRow id="todays-highlights-title" title="Today’s Highlights" ariaLabel="Today’s Highlights" trackClassName="gap-3">
      {highlights.map((highlight) => {
      const viewHighlight = () => onView({
        name: highlight.appName,
        tagline: highlight.appTagline,
        icon: highlight.icon
      });
      const price = getItemPrice(highlight.appName);
      return <article key={highlight.title} role="listitem" className="card-hover-outline group shape-container flex min-h-[290px] w-full min-w-0 flex-col overflow-hidden bg-[var(--surface-raised)] shadow-sm ring-1 ring-[var(--hairline)]">
          <button type="button" onClick={viewHighlight} aria-label={`View ${highlight.appName}`} className="relative flex-1 bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
            {highlight.badge && <span className="shape-capsule absolute left-3 top-3 z-10 border border-[var(--hairline-strong)] bg-[var(--surface-overlay)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--text-primary)]">{highlight.badge}</span>}
          </button>

          <div className="flex items-center gap-2 border-t border-[var(--hairline)] bg-[var(--surface-raised)] px-3 py-2">
            <button type="button" onClick={viewHighlight} aria-label={`View ${highlight.appName}`} className="shape-concentric h-10 w-10 shrink-0 bg-[var(--surface-sunken)] ring-1 ring-[var(--hairline)] transition-[transform,background-color] duration-180 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
            <button type="button" onClick={viewHighlight} aria-label={`View ${highlight.appName}`} className="min-w-0 flex-1 text-left transition-[transform,filter] duration-180 ease-out hover:-translate-y-0.5 hover:brightness-95 focus:outline-none">
              <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{highlight.appName}</span>
              <span className="block truncate text-[11px] text-[var(--text-secondary)]">{highlight.appTagline}</span>
            </button>
            <button type="button" onClick={viewHighlight} aria-label={`View ${highlight.appName} for ${price}`} style={{
            color: 'var(--accent-text)',
            backgroundColor: 'var(--accent-soft)'
          }} className="shape-capsule px-3 py-1 text-[12px] font-semibold transition-[transform,background-color] duration-180 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{price}</button>
          </div>
        </article>;
    })}
    </SectionLoopRow>;
}
