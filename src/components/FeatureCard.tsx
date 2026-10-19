import React from 'react';
import { getItemPrice } from './pricing';
import { resolveSourceImage } from '../data/sourceImages';
import { ResponsiveImage } from './ui/ResponsiveImage';
export type FeatureCardApp = {
  name: string;
  tagline: string;
  icon: string;
  // Optional document metadata used by the quick-look viewer.
  fileName?: string;
  pageCount?: number;
  aspectRatio?: number;
  // Existing feed metadata surfaced in the viewer's information rail.
  description?: string;
  mediaLabel?: string;
  // Real source imagery for the first page of the quick-look viewer.
  coverImage?: string;
  coverAlt?: string;
  coverKind?: 'video' | 'document';
  // Creator attribution so the quick-look viewer can link back to their profile.
  creatorId?: string;
  creatorName?: string;
  creatorKind?: string;
  creatorAvatar?: string;
};
type FeatureCardProps = {
  image: string;
  imageAlt: string;
  eyebrow: string;
  eyebrowClassName?: string;
  title: string;
  subtitle?: string;
  badge?: 'Sold Out' | 'Limited Supply';
  icon: string;
  appName: string;
  appTagline: string;
  className?: string;
  titleClassName?: string;
  footerClassName?: string;
  overlayClassName?: string;
  onView?: (app: FeatureCardApp) => void;
  onProfile?: (app: FeatureCardApp) => void;
};
export function FeatureCard({
  image,
  imageAlt,
  eyebrow,
  eyebrowClassName: _eyebrowClassName = 'text-white/90',
  title,
  subtitle,
  badge,
  icon,
  appName,
  appTagline,
  className = '',
  titleClassName = 'text-4xl',
  footerClassName: _footerClassName = 'bg-black/25',
  overlayClassName: _overlayClassName = 'from-black/10 via-black/30 to-black/50',
  onView,
  onProfile: _onProfile
}: FeatureCardProps) {
  const item = {
    name: appName,
    tagline: appTagline,
    icon
  };
  function viewItem() {
    onView?.(item);
  }
  const sourceImage = resolveSourceImage(appName);
  const mediaSource = image || sourceImage.src;
  const mediaAlt = imageAlt || sourceImage.alt;
  return <article className={`content-card card-hover-outline group shape-container flex min-w-0 flex-col overflow-hidden bg-[var(--surface-raised)] shadow-sm ring-1 ring-[var(--hairline)] ${className}`}>
      <button type="button" onClick={viewItem} aria-label={`View ${appName}`} className="relative min-h-[172px] flex-1 overflow-hidden rounded-t-[var(--shape-container)] bg-[var(--surface-sunken)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
        {/* Real source imagery, resolved stably per item. */}
        {mediaSource.endsWith('.mp4') ? <video src={mediaSource} autoPlay loop muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" /> : <ResponsiveImage src={mediaSource} alt={mediaAlt} sizes="(min-width: 1100px) 28vw, (min-width: 700px) 45vw, 92vw" className="absolute inset-0 h-full w-full object-cover" />}
        {badge && <span className="shape-capsule absolute left-3 top-3 z-10 border border-[var(--hairline-strong)] bg-[var(--surface-overlay)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
            {badge}
          </span>}
      </button>

      <div className="flex items-center gap-2 border-t border-[var(--hairline)] bg-[var(--surface-raised)] px-3 py-2">
        <button type="button" onClick={viewItem} aria-label={`View ${appName}`} className="shape-concentric h-10 w-10 shrink-0 bg-[var(--surface-sunken)] ring-1 ring-[var(--hairline)] transition-[transform,background-color] duration-[var(--m-base)] ease-[var(--m-enter)] hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
        <button type="button" onClick={viewItem} aria-label={`View ${appName}`} className="min-w-0 flex-1 text-left transition-[transform,filter] duration-[var(--m-base)] ease-[var(--m-enter)] hover:-translate-y-0.5 hover:brightness-95 focus:outline-none">
          <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{appName}</span>
          <span className="block truncate text-[11px] text-[var(--text-secondary)]">{appTagline}</span>
        </button>
        <button type="button" onClick={viewItem} aria-label={`View ${appName} for ${getItemPrice(appName)}`} style={{
        color: 'var(--accent-text)',
        backgroundColor: 'var(--accent-soft)'
      }} className="shape-capsule px-3 py-1 text-[12px] font-semibold transition-[transform,background-color] duration-[var(--m-base)] ease-[var(--m-enter)] hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{getItemPrice(appName)}</button>
      </div>
    </article>;
}
