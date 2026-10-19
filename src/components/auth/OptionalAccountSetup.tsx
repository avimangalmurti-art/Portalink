import React, { useRef, useState } from 'react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { MobileOnboardingAppearance } from './MobileOnboarding';
import type { AccountAppearanceProps } from './AccountWelcomeSurface';
import './oneScreenEntry.css';

export function OptionalAccountSetup(props: AccountAppearanceProps & { onDone: () => void; onFirstProject: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const viewport = useDialogViewport();
  const [appearance, setAppearance] = useState(false);
  useModalFocus(true, dialog, props.onDone);
  return <div ref={viewport} className="modal-scrim fixed inset-x-0 z-[90] flex items-center justify-center p-5" style={{ top:'var(--dialog-viewport-top, 0px)', height:'var(--dialog-viewport-height, 100dvh)' }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="optional-setup-title" tabIndex={-1}
      className="optional-account-setup shape-squircle w-full max-w-[420px] max-h-full overflow-y-auto bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] shadow-2xl outline-none">
      <h1 id="optional-setup-title" className="text-2xl font-semibold">Make Portalink yours</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">Your account is ready. These steps are optional and available later in Settings and Studio.</p>
      <button type="button" className="mt-5 min-h-11 w-full rounded-xl border p-3" aria-expanded={appearance} onClick={() => setAppearance(value => !value)}>Choose appearance</button>
      {appearance && <MobileOnboardingAppearance {...props} showPreview={false} />}
      <button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-[var(--accent-text)] p-3 text-[var(--surface-canvas)]" onClick={props.onFirstProject}>Add your first project</button>
      <button type="button" className="mt-3 min-h-11 w-full p-3" onClick={props.onDone}>Skip for now</button>
    </section>
  </div>;
}
