import React from 'react';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';
import type { AccountAppearanceProps } from './AccountWelcomeSurface';
import { findNavAccent, isLightSurface, navAccents, systemGrays } from '../../data/navButtonTokens';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import { AppearanceSwitch } from '../ui/AppearanceSwitch';
import { Button } from '../ui/Button';

export type MobileSignupStep = 'appearance' | 'account' | 'profile' | 'verification';

export function MobileOnboardingAppearance(props: AccountAppearanceProps) {
  const theme = props.theme ?? 'dark';
  const selected = findNavAccent(props.accentColor);
  return <div className="mobile-onboarding-appearance">
    <p className="mobile-onboarding-brand">Portalink<br />Networks</p>
    <fieldset><legend>Accent colour</legend>
      <div role="radiogroup" aria-label="Accent colour" onKeyDown={handleRadioGroupKeyDown} className="mobile-onboarding-swatches">
        {navAccents.map(option => <button key={option.id} type="button" role="radio" aria-label={option.label} aria-checked={selected.id === option.id} tabIndex={selected.id === option.id ? 0 : -1} data-keep-color="" onClick={() => props.onAccentColorChange(option[theme])}>
          <span style={{ backgroundColor: option[theme] }}>{selected.id === option.id && <CheckIcon size={18} aria-hidden="true" style={{ color: isLightSurface(option[theme]) ? '#1c1c1e' : '#fff' }} />}</span>
        </button>)}
      </div>
    </fieldset>
    {props.onSystemGrayChange && <fieldset><legend>System grey</legend>
      <div role="radiogroup" aria-label="System grey" onKeyDown={handleRadioGroupKeyDown} className="mobile-onboarding-swatches">
        {systemGrays.map(option => <button key={option.id} type="button" role="radio" aria-label={option.label} aria-checked={(props.systemGray ?? 'gray') === option.id} tabIndex={(props.systemGray ?? 'gray') === option.id ? 0 : -1} data-keep-color="" onClick={() => props.onSystemGrayChange?.(option.id)}>
          <span style={{ backgroundColor: option[theme] }}>{(props.systemGray ?? 'gray') === option.id && <CheckIcon size={18} aria-hidden="true" style={{ color: isLightSurface(option[theme]) ? '#1c1c1e' : '#fff' }} />}</span>
        </button>)}
      </div>
    </fieldset>}
    <div className="mobile-onboarding-switch"><label htmlFor="onboarding-contrast">High contrast</label><AppearanceSwitch id="onboarding-contrast" label="High contrast" isOn={props.highContrast} onToggle={() => props.onHighContrastChange(!props.highContrast)} /></div>
    <div className="mobile-onboarding-switch"><label htmlFor="onboarding-translucency">Reduce translucency</label><AppearanceSwitch id="onboarding-translucency" label="Reduce translucency" isOn={props.reduceTranslucency} onToggle={() => props.onReduceTranslucencyChange(!props.reduceTranslucency)} /></div>
  </div>;
}

export function MobileOnboardingAction({ children = 'Continue', busy = false, onClick }: { children?: React.ReactNode; busy?: boolean; onClick?: () => void }) {
  return <div className="mobile-onboarding-footer"><Button type={onClick ? 'button' : 'submit'} variant="primary" size="lg" fullWidth isLoading={busy} disabled={busy} onClick={onClick}>
    {children}{!busy && <ArrowRightIcon size={22} aria-hidden="true" />}
  </Button></div>;
}

export function MobileOnboardingWelcome({ onComplete, notice, isPrototype = false }: { onComplete: () => void; notice?: React.ReactNode; isPrototype?: boolean }) {
  return <div className="mobile-onboarding-welcome">
    <div className="mobile-onboarding-art"><img src="/og.png" alt="Hello World — Portalink" width={741} height={981} /></div>
    <p role="status" className={isPrototype ? 'text-sm text-[var(--text-secondary)]' : 'sr-only'}>{isPrototype ? 'Preview only. This profile lasts for this session.' : 'Your profile is saved and ready.'}</p>
    {notice}
    <MobileOnboardingAction onClick={onComplete}>Enter Portalink</MobileOnboardingAction>
  </div>;
}
