import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';
import React, { useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { NavigationButtonsPanel } from './settings/NavigationButtonsPanel';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { Button } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { DeleteAccountDialog } from '../features/auth/DeleteAccountDialog';
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
  appearanceSaving?: boolean;
  appearanceError?: string | null;
  onRetryAppearance?: () => void;
};

/**
 * Appearance preferences and the explicit account deletion entry point.
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
  onBack,
  appearanceSaving,
  appearanceError,
  onRetryAppearance
}: ControlCenterPageProps) {
  const auth = useAuth();
  const [deletingAccount, setDeletingAccount] = useState(false);
  return <div className="min-h-full w-full">
      <header className="ps-panel-toolbar global-control-header side-panel-content-inset w-full">
        <ScreenBack><button type="button" onClick={onBack} className="side-panel-primary-control side-panel-control-row px-3 text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
          Back
        </button></ScreenBack>
        <h1 className="text-large font-bold tracking-tight text-[var(--text-primary)]">Appearance</h1>
      </header>

      <div className="px-[var(--content-gutter)] py-4">
        <section aria-label="Appearance settings" className="w-full max-w-[920px] space-y-4 p-2">
          {appearanceError ? <p role="alert" className="text-small text-[var(--text-secondary)]">{appearanceError} <button type="button" onClick={onRetryAppearance} className="text-[var(--accent-text)]">Try again</button></p> : appearanceSaving ? <p role="status" className="text-small text-[var(--text-secondary)]">Saving website colors…</p> : null}
          <NavigationButtonsPanel theme={theme} appearanceMode={appearanceMode} onAppearanceModeChange={onAppearanceModeChange} systemGray={systemGray} onSystemGrayChange={onSystemGrayChange} accentColor={accentColor} onAccentColorChange={onAccentColorChange} highContrast={highContrast} onHighContrastChange={onHighContrastChange} reduceTranslucency={reduceTranslucency} onReduceTranslucencyChange={onReduceTranslucencyChange} />
          {auth.isAuthenticated && <section aria-labelledby="account-settings-title" className="rounded-[15px] border border-[var(--hairline)] bg-[var(--surface-raised)] px-[23px] py-[18px]">
            <h2 id="account-settings-title" className="text-[19px] font-semibold leading-tight text-[var(--text-primary)]">Account</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1 basis-48">
                <h3 className="text-[14px] font-medium text-[var(--text-primary)]">Delete account</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">Permanently remove your account and its content. You’ll be asked to confirm.</p>
              </div>
              <Button variant="secondary" size="lg" onClick={() => setDeletingAccount(true)}>Delete account…</Button>
            </div>
          </section>}
        </section>
      </div>
      {deletingAccount && <DeleteAccountDialog isOpen onClose={() => setDeletingAccount(false)} />}
    </div>;
}
