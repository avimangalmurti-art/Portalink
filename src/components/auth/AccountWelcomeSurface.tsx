import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ChevronLeftIcon, XIcon, CheckIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { findNavAccent, isLightSurface, navAccents } from '../../data/navButtonTokens';
import { resolveAccentTokens } from '../../utils/accentTokens';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { AppearanceSwitch } from '../ui/AppearanceSwitch';
import { usePresentation } from '../../presentation/usePresentation';
import { PortalinkSplashLoader } from '../ui/PortalinkSplashLoader';
import './helloWorldSignIn.css';
import './profile-setup.css';

export type AccountAppearanceProps = {
  theme?: 'light' | 'dark';
  systemGray?: string;
  onSystemGrayChange?: (gray: string) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  highContrast: boolean;
  onHighContrastChange: (enabled: boolean) => void;
  reduceTranslucency: boolean;
  onReduceTranslucencyChange: (enabled: boolean) => void;
};

/** One welcome scene for every step of the account journey. */
export function AccountWelcomeSurface({ title, theme = 'dark', accentColor, onAccentColorChange, highContrast, onHighContrastChange, reduceTranslucency, onReduceTranslucencyChange, mobileOnboarding = false, profileSetup = false, signIn = false, onStepBack, showAppearance = true, showWelcomeMedia = true, busy = false, dirty = false, onDismiss, children }: AccountAppearanceProps & {
  title: string;
  mobileOnboarding?: boolean;
  profileSetup?: boolean;
  signIn?: boolean;
  onStepBack?: () => void;
  showAppearance?: boolean;
  showWelcomeMedia?: boolean;
  busy?: boolean;
  dirty?: boolean;
  onDismiss: () => void;
  children: React.ReactNode | ((requestLeave: (action: () => void) => void) => React.ReactNode);
}) {
  const viewportRef = useDialogViewport();
  const isMobile = usePresentation() === 'mobile';
  const onboarding = isMobile && mobileOnboarding;
  const mobileRef = useRef(isMobile);
  mobileRef.current = isMobile;
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const requestLeave = (action: () => void) => {
    if (busy) return;
    if (dirty) setPendingLeave(() => action);
    else action();
  };
  const dismiss = () => requestLeave(onDismiss);
  useModalFocus(true, sheetRef, () => {
    if (pendingLeave) setPendingLeave(null);
    else dismiss();
  });
  useLayoutEffect(() => {
    if (!mobileRef.current) return;
    // Show the whole welcome screen before paint, including when the browser
    // restores a previously focused field. Never reset focus on keyboard resize.
    const showWelcome = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')) active.blur();
      if (contentRef.current) contentRef.current.scrollTop = 0;
      const stepFields = contentRef.current?.querySelector<HTMLElement>(profileSetup ? '.profile-setup-fields' : '.mobile-onboarding-fields');
      if (stepFields) stepFields.scrollTop = 0;
      headingRef.current?.focus({ preventScroll: true });
    };
    showWelcome();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && mobileRef.current) showWelcome();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [title, profileSetup]);
  useEffect(() => {
    if (!mobileRef.current) headingRef.current?.focus({ preventScroll: true });
  }, [title]);
  useEffect(() => {
    if (!isMobile) return;
    const content = contentRef.current;
    if (!content) return;
    let frame = 0;
    const revealField = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !content.contains(field) || !field.matches('input:not([type="file"]), textarea, select')) return;
        const scroller = profileSetup ? content.querySelector<HTMLElement>('.profile-setup-fields') ?? content : content;
        const bounds = scroller.getBoundingClientRect();
        const rect = field.getBoundingClientRect();
        // iOS can resize/pan the visual viewport after its initial focus scroll.
        // Recheck after layout so the active field stays inside our own scroller.
        if (rect.top < bounds.top + 16 || rect.bottom > bounds.bottom - 16) {
          field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }
      });
    };
    content.addEventListener('focusin', revealField);
    const observer = new ResizeObserver(revealField);
    observer.observe(content);
    window.visualViewport?.addEventListener('resize', revealField);
    window.visualViewport?.addEventListener('scroll', revealField);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      content.removeEventListener('focusin', revealField);
      window.visualViewport?.removeEventListener('resize', revealField);
      window.visualViewport?.removeEventListener('scroll', revealField);
    };
  }, [isMobile, profileSetup]);
  const keepEditing = () => { setPendingLeave(null); headingRef.current?.focus({ preventScroll: true }); };
  const selected = findNavAccent(accentColor);
  if (profileSetup) return <div ref={viewportRef} className="profile-setup-backdrop modal-scrim" data-profile-setup={theme} data-presentation={isMobile ? 'mobile' : 'web'}
    onPointerDown={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <section ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} data-welcome-contrast={highContrast} data-welcome-solid={reduceTranslucency}
      className="profile-setup-card" data-ui-surface={isMobile ? 'sheet' : 'popup'} style={resolveAccentTokens(accentColor, theme)}>
      <header className="profile-setup-header">
        <button type="button" aria-label="Close profile setup" disabled={busy} onClick={dismiss} data-ui-control="icon" data-control-size="lg" data-control-variant="ghost"><XIcon size={20} aria-hidden="true" /></button>
        <span>Portalink</span><span className="profile-setup-header-spacer" aria-hidden="true" />
      </header>
      <div ref={contentRef} className="profile-setup-content">
        <div className="profile-setup-intro">
          <div className="profile-setup-art" aria-hidden="true"><img src="/onboarding/makers.webp" alt="" width="1254" height="1254" draggable={false} /></div>
          <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
          <p>Make a home for your ideas.</p>
        </div>
        {showAppearance && !isMobile && <details className="profile-setup-appearance" hidden={Boolean(pendingLeave)}>
          <summary aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); }}>Appearance</summary>
          <fieldset className="profile-setup-appearance-controls" disabled={busy}>
            <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Accent color" className="profile-setup-colors">
              {navAccents.map(option => <button key={option.id} type="button" role="radio" aria-checked={selected.id === option.id} tabIndex={selected.id === option.id ? 0 : -1} aria-label={option.label} title={option.label}
                disabled={busy} data-keep-color="" onClick={() => onAccentColorChange(option.dark)} className="profile-setup-swatch">
                <span className="squircle" style={{ backgroundColor: option.dark }} />
                {selected.id === option.id && <CheckIcon size={18} aria-hidden="true" style={{ color: isLightSurface(option.dark) ? '#1c1c1e' : '#fff' }} />}
              </button>)}
            </div>
            <div className="profile-setup-switches">
              <div className="profile-setup-switch-row">
                <label htmlFor="welcome-high-contrast">High Contrast</label>
                <AppearanceSwitch id="welcome-high-contrast" label="High Contrast" isOn={highContrast} onToggle={() => onHighContrastChange(!highContrast)} />
              </div>
              <div className="profile-setup-switch-row">
                <label htmlFor="welcome-reduce-translucency">Reduce Translucency</label>
                <AppearanceSwitch id="welcome-reduce-translucency" label="Reduce Translucency" isOn={reduceTranslucency} onToggle={() => onReduceTranslucencyChange(!reduceTranslucency)} />
              </div>
            </div>
          </fieldset>
        </details>}
        <fieldset className="profile-setup-body" disabled={busy} hidden={Boolean(pendingLeave)}>{typeof children === 'function' ? children(requestLeave) : children}</fieldset>
      </div>
    </section>
    {pendingLeave && <ConfirmationDialog title="Discard your changes?" description="Your unsaved account details will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" variant="destructive" pending={busy} onCancel={keepEditing} onConfirm={()=>{if(busy||!pendingLeave)return;const leave=pendingLeave;setPendingLeave(null);leave();}}/>}
  </div>;
  return <div ref={viewportRef} data-mobile-onboarding={onboarding ? theme : undefined} data-account-signin={signIn || undefined} className="modal-scrim auth-signin-experience account-welcome-overlay fixed inset-x-0 z-[80] flex items-center justify-center p-4" style={{
    top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)',
  }} onPointerDown={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <section ref={sheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} data-welcome-contrast={highContrast} data-welcome-solid={reduceTranslucency}
      data-ui-shape={!isMobile && !signIn ? 'popup' : undefined} className={`${signIn ? '' : 'auth-signin-vanta '}account-welcome-card flex max-h-full w-full max-w-[560px] flex-col rounded-[14px] border p-5 text-[var(--text-primary)] outline-none sm:p-7`}
      style={resolveAccentTokens(accentColor, signIn ? 'light' : onboarding ? theme : 'dark')}>
      <button type="button" aria-label={isMobile ? 'Back' : 'Close'} disabled={busy} onClick={onboarding && onStepBack && !pendingLeave ? onStepBack : dismiss} className="account-welcome-close self-end rounded-lg p-1.5 text-[var(--text-secondary)] hover:text-white focus-visible:outline focus-visible:outline-2 disabled:opacity-40">{onboarding ? <ChevronLeftIcon size={26} aria-hidden="true" /> : isMobile ? <><ArrowLeftIcon size={20} aria-hidden="true" /><span>Back</span></> : <XIcon size={18} aria-hidden="true" />}</button>
      <div ref={contentRef} className="account-welcome-content scrollbar-slim min-h-0 overflow-y-auto overscroll-contain px-1 pb-1">
        <header className={signIn && showWelcomeMedia ? 'sr-only' : 'account-welcome-heading mb-5 text-center'}>
          {!onboarding && !signIn && <h1 className="text-[clamp(23px,5.4vw,34px)] font-semibold leading-tight tracking-[-0.045em] text-white">WELCOME TO PORTALINK</h1>}
          <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-[15px] font-medium text-[var(--text-secondary)]">{title}</h2>
        </header>
        {signIn && showWelcomeMedia && <PortalinkSplashLoader welcomeMedia />}
        {showAppearance && !signIn && <div className="account-welcome-appearance mb-5">
          <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Accent color" className="account-welcome-colors">
            {navAccents.map(option => <button key={option.id} type="button" role="radio" aria-checked={selected.id === option.id} tabIndex={selected.id === option.id ? 0 : -1} aria-label={option.label} title={option.label}
              disabled={busy} data-keep-color="" onClick={() => onAccentColorChange(option.dark)} className="account-welcome-swatch relative flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              <span className="squircle absolute inset-0" style={{ backgroundColor: option.dark }} />
              {selected.id === option.id && <CheckIcon className="relative" size={18} aria-hidden="true" style={{ color: isLightSurface(option.dark) ? '#1c1c1e' : '#fff' }} />}
            </button>)}
          </div>
          <div className="account-welcome-switches">
            <div className="account-welcome-switch-row">
              <label htmlFor="welcome-high-contrast">High Contrast</label>
              <AppearanceSwitch id="welcome-high-contrast" label="High Contrast" isOn={highContrast} onToggle={() => onHighContrastChange(!highContrast)} />
            </div>
            <div className="account-welcome-switch-row">
              <label htmlFor="welcome-reduce-translucency">Reduce Translucency</label>
              <AppearanceSwitch id="welcome-reduce-translucency" label="Reduce Translucency" isOn={reduceTranslucency} onToggle={() => onReduceTranslucencyChange(!reduceTranslucency)} />
            </div>
          </div>
        </div>}
        <div className={onboarding ? 'mobile-onboarding-body' : undefined} hidden={Boolean(pendingLeave)}>{typeof children === 'function' ? children(requestLeave) : children}</div>
      </div>
    </section>
    {pendingLeave && <ConfirmationDialog title="Discard your changes?" description="Your unsaved account details will be lost." confirmLabel="Discard changes" cancelLabel="Keep editing" variant="destructive" pending={busy} onCancel={keepEditing} onConfirm={()=>{if(busy||!pendingLeave)return;const leave=pendingLeave;setPendingLeave(null);leave();}}/>}
  </div>;
}
