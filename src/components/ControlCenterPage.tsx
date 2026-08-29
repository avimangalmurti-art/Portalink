import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { NavigationButtonsPanel } from './settings/NavigationButtonsPanel';
import { InterfaceIcon } from './ui/InterfaceIcon';
import type { AppearanceTheme, StoredAppearanceMode } from '../utils/appearancePreferences';

type ControlCenterPageProps = {
  theme: AppearanceTheme;
  appearanceMode: StoredAppearanceMode;
  onAppearanceModeChange: (mode: StoredAppearanceMode) => void;
  systemGray: string;
  onSystemGrayChange: (id: string) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  highContrast: boolean;
  onHighContrastChange: (enabled: boolean) => void;
  reduceTranslucency: boolean;
  onReduceTranslucencyChange: (enabled: boolean) => void;
  onBack: () => void;
};

/**
 * Production settings expose only controls that work. Account security,
 * integrations, notifications, and storage remain absent until their services
 * can complete the actions they promise.
 */
export function ControlCenterPage({
  theme,
  appearanceMode,
  onAppearanceModeChange,
  systemGray,
  onSystemGrayChange,
  accentColor,
  onAccentColorChange,
  highContrast,
  onHighContrastChange,
  reduceTranslucency,
  onReduceTranslucencyChange,
  onBack
}: ControlCenterPageProps) {
  return <div className="min-h-full w-full">
      <header className="ps-panel-toolbar global-control-header w-full gap-2 px-[var(--content-gutter)]">
        <button type="button" onClick={onBack} className="shape-capsule inline-flex h-8 items-center gap-1.5 px-2.5 text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
          Back
        </button>
        <h1 className="text-large font-bold tracking-tight text-[var(--text-primary)]">Appearance</h1>
      </header>

      <div className="px-[var(--content-gutter)] py-4">
        <section aria-label="Appearance settings" className="ps-panel w-full max-w-[920px] rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-2">
          <NavigationButtonsPanel theme={theme} appearanceMode={appearanceMode} onAppearanceModeChange={onAppearanceModeChange} systemGray={systemGray} onSystemGrayChange={onSystemGrayChange} accentColor={accentColor} onAccentColorChange={onAccentColorChange} highContrast={highContrast} onHighContrastChange={onHighContrastChange} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={onReduceTranslucencyChange} />
        </section>
      </div>
    </div>;
}
