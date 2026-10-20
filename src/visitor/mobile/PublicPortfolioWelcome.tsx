import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MobileOnboardingAppearance } from '../../components/auth/MobileOnboarding';
import { PortalinkSplashLoader } from '../../components/ui/PortalinkSplashLoader';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import type { useDeviceAppearance } from '../../hooks/useDeviceAppearance';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import './public-welcome.css';

/** The actual portfolio remains mounted and visible as the appearance preview. */
export function PublicPortfolioWelcome({ appearance, onComplete }: {
  appearance: ReturnType<typeof useDeviceAppearance>; onComplete: () => void;
}) {
  const [intro, setIntro] = useState(true);
  const dialog = useRef<HTMLDivElement>(null), viewport = useDialogViewport();
  const finishIntro = useCallback(() => setIntro(false), []);
  useEffect(() => {
    // Keep the shell's existing sibling layout intact while its live preview is inactive.
    const background = dialog.current?.closest('.app-shell')?.querySelectorAll<HTMLElement>(':scope > .codex-workspace, :scope > .mobile-shared-drawer-layer');
    const previous = Array.from(background ?? [], element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    previous.forEach(({ element }) => { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); });
    return () => previous.forEach(({ element, inert, hidden }) => {
      if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
      if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
    });
  }, []);
  useModalFocus(true, dialog, onComplete, true);
  return <ModalPortal><div ref={viewport} data-public-welcome="" style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}>
    <div ref={dialog} className="public-welcome-dialog" role="dialog" aria-modal="true" aria-label={intro ? 'Opening catalogue' : 'Choose your appearance'} tabIndex={-1}>
      {intro ? <><PortalinkSplashLoader timedIntro onComplete={finishIntro} /><button type="button" className="public-welcome-skip" onClick={finishIntro}>Skip intro</button></> :
        <section className="public-welcome-sheet">
          <header><h1>Choose your appearance</h1><p>See it on the catalogue behind you.</p></header>
          <div className="public-welcome-options">
            <div className="public-welcome-mode" role="radiogroup" aria-label="Appearance" onKeyDown={handleRadioGroupKeyDown}>
              {(['auto', 'light', 'dark'] as const).map(mode => <button type="button" key={mode} role="radio" aria-checked={appearance.mode === mode} tabIndex={appearance.mode === mode ? 0 : -1} onClick={() => appearance.chooseMode(mode)}>{mode === 'auto' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}</button>)}
            </div>
            <MobileOnboardingAppearance showPreview={false} theme={appearance.theme} systemGray={appearance.systemGray}
              onSystemGrayChange={systemGray => appearance.chooseAppearance({ systemGray })} accentColor={appearance.accentColor}
              onAccentColorChange={accentColor => appearance.chooseAppearance({ accentColor })} highContrast={appearance.highContrast}
              onHighContrastChange={highContrast => appearance.chooseAppearance({ highContrast })} reduceTranslucency={appearance.reduceTranslucency}
              onReduceTranslucencyChange={reduceTranslucency => appearance.chooseAppearance({ reduceTranslucency })} />
          </div>
          <footer><button type="button" onClick={onComplete}>View catalogue</button></footer>
        </section>}
    </div>
  </div></ModalPortal>;
}
