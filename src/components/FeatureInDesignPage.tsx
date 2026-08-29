import React from 'react';
import { ArrowLeftIcon, BarChart3Icon, WarehouseIcon } from 'lucide-react';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { PortalRingIcon } from './PortalRingIcon';
import type { InterfaceIconSource } from './ui/InterfaceIcon';

export type InDesignFeature = 'Portals' | 'Insights' | 'Studio';

const FEATURE_ICONS: Record<InDesignFeature, InterfaceIconSource> = {
  Portals: PortalRingIcon,
  Insights: BarChart3Icon,
  Studio: WarehouseIcon,
};

/**
 * A truthful holding screen for reserved primary destinations. It keeps the
 * route and navigation state real without exposing prototype functionality as
 * though it were finished product behavior.
 */
export function FeatureInDesignPage({
  feature,
  onBack,
}: {
  feature: InDesignFeature;
  onBack: () => void;
}) {
  const Icon = FEATURE_ICONS[feature];
  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header relative shrink-0 justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="ps-btn ps-btn-secondary inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-2 text-[14px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <InterfaceIcon icon={ArrowLeftIcon} size="sm" weight="medium" mirroredInRtl />
          Back
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[14px] font-semibold">{feature}</h1>
        <span className="text-[12px] text-[var(--text-tertiary)]">In development</span>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
        <section aria-labelledby="feature-in-design-title" className="flex max-w-[460px] flex-col items-center text-center">
          <span className="shape-compact flex h-10 w-10 items-center justify-center bg-[var(--control-rest-surface)] text-[var(--icon-secondary)]">
            <InterfaceIcon icon={Icon} size="lg" weight="medium" />
          </span>
          <h2 id="feature-in-design-title" className="mt-4 text-[20px] font-semibold tracking-[-0.015em]">
            {feature} is still being designed
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            This destination is part of Portalink’s planned workspace, but it is not ready to use yet.
          </p>
        </section>
      </main>
    </div>
  );
}
