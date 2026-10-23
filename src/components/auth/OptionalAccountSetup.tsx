import React, { useRef, useState } from 'react';
import { ArrowRightIcon, ChevronDownIcon, PaletteIcon, XIcon } from 'lucide-react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { usePresentation } from '../../presentation/usePresentation';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { MobileOnboardingAppearance } from './MobileOnboarding';
import type { AccountAppearanceProps } from './AccountWelcomeSurface';
import { resolveNavButtonTokens } from '../../data/navButtonTokens';
import './oneScreenEntry.css';
import './first-login-welcome.css';
import './optional-account-setup.css';

export function OptionalAccountSetup(props: AccountAppearanceProps & { onDone: () => void; onFirstProject: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const viewport = useDialogViewport();
  const [appearance, setAppearance] = useState(false);
  const presentation = usePresentation();
  const neutral = resolveNavButtonTokens(props.theme ?? 'dark', props.accentColor, props.highContrast, props.reduceTranslucency, props.systemGray ?? 'gray');
  useModalFocus(true, dialog, props.onDone);
  return <div ref={viewport} className="first-login-welcome-backdrop optional-setup-backdrop modal-scrim" data-presentation={presentation}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="optional-setup-title" aria-describedby="optional-setup-description" tabIndex={-1}
      className="first-login-welcome optional-account-setup" data-appearance-open={appearance} data-ui-shape={presentation === 'mobile' ? 'sheet' : 'popup'}
      style={{
        '--optional-setup-surface': neutral['--control-rest-surface'],
        '--optional-setup-foreground': neutral['--control-text'],
        '--optional-setup-border': neutral['--control-border'],
        '--optional-setup-hover-surface': neutral['--control-hover-surface'],
        '--optional-setup-hover-foreground': neutral['--control-hover-text'],
        '--optional-setup-selected-surface': neutral['--control-selected-surface'],
        '--optional-setup-focus-ring': neutral['--navigation-focus-ring'],
      } as React.CSSProperties}>
      <header><button type="button" onClick={props.onDone} aria-label="Skip account setup" data-ui-shape="icon"><InterfaceIcon icon={XIcon}/></button><span>Portalink</span><span className="optional-setup-header-spacer" aria-hidden="true"/></header>
      <div className="first-welcome-slide optional-setup-content">
        <div className="first-welcome-art optional-setup-art" aria-hidden="true"><img src="/onboarding/makers.webp" alt="" width="1254" height="1254" draggable={false}/></div>
        <h1 id="optional-setup-title">Make Portalink yours</h1>
        <p id="optional-setup-description">Your catalogue starts with one project.</p>
        <button type="button" className="optional-setup-appearance-toggle" data-ui-shape="action" aria-expanded={appearance} aria-controls={appearance ? 'optional-setup-appearance' : undefined} onClick={() => setAppearance(value => !value)}>
          <InterfaceIcon icon={PaletteIcon}/><span>{appearance ? 'Hide appearance' : 'Choose appearance'}</span><InterfaceIcon icon={ChevronDownIcon}/>
        </button>
        {appearance && <div id="optional-setup-appearance" className="optional-setup-appearance"><MobileOnboardingAppearance {...props} showPreview={false}/></div>}
      </div>
      <footer className="optional-setup-actions">
        <button type="button" className="optional-setup-primary" onClick={props.onFirstProject}>Add your first project<InterfaceIcon icon={ArrowRightIcon}/></button>
        <button type="button" className="optional-setup-skip" onClick={props.onDone}>Skip for now</button>
      </footer>
    </section>
  </div>;
}
