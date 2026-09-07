import type { CSSProperties, ReactNode } from 'react';

/** Fit both dimensions into the reserved slot without changing the saved crop ratio. */
export function ProjectPreviewFrame({ aspectRatio, label, children, controls }: { aspectRatio: number; label?: string; children: ReactNode; controls?: ReactNode }) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 4 / 3;
  return <div className="project-preview-space">
    <div aria-label={label} className="project-preview-frame overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-sunken)]" style={{ '--preview-ratio': ratio, aspectRatio: ratio } as CSSProperties}>{children}</div>
    {controls}
  </div>;
}
