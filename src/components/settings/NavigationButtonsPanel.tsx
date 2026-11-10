import { useId } from 'react';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import React, { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CheckIcon, ChevronRightIcon, RotateCcwIcon } from 'lucide-react';
import { findNavAccent, findSystemGray, isLightSurface, navAccents, systemGrays } from '../../data/navButtonTokens';
import type { AppearanceTheme, StoredAppearanceMode } from '../../utils/appearancePreferences';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { AppearanceSwitch } from '../ui/AppearanceSwitch';
import { resetResizablePanelLayout } from '../ui/ResizablePanelHandle';

type NavigationButtonsPanelProps = {
  inline?: boolean;
  selectedSection?: AppearanceSection | null;
  onSectionOpen?: (section: AppearanceSection) => void;
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
};

const appearanceOptions: ReadonlyArray<{ mode: StoredAppearanceMode; label: string }> = [
  { mode: 'auto', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' }
];

type AppearanceSection = 'system-grey' | 'appearance';

// Swatches are samples of the colour being chosen, rather than application
// chrome, so their literal colour intentionally sits outside the semantic
// surface system.
function swatchSurface(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    ['--system-color' as string]: color
  };
}

export function NavigationButtonsPanel({
  inline = false,
  selectedSection = null,
  onSectionOpen,
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
  onReduceTranslucencyChange
}: NavigationButtonsPanelProps) {
  const [layoutWasReset, setLayoutWasReset] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const activeAccent = findNavAccent(accentColor);
  const activeAppearance = appearanceOptions.find((option) => option.mode === appearanceMode)?.label ?? 'System';
  const activeSystemGray = findSystemGray(systemGray);
  const accent = theme === 'dark' ? activeAccent.dark : activeAccent.light;
  const ease = 'var(--m-enter)';
  const transition = shouldReduceMotion
    ? 'none'
    : `background-color var(--m-fast) ${ease}, color var(--m-fast) ${ease}, border-color var(--m-fast) ${ease}, box-shadow var(--m-fast) ${ease}`;

  // Resolve swatches visually without saving a colour just because the viewer
  // changed platform/theme or opened settings. Only explicit choices save.

  return (
    <section
      aria-label="Appearance settings"
      className="nav-settings-panel w-full rounded-[15px] border border-[var(--hairline)] bg-[var(--surface-raised)] px-[23px] py-[18px]"
      style={{ ['--nav-focus' as string]: accent, transition }}
    >
      <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
        Appearance
      </h2>
      <p className="mt-1.5 text-[13px] leading-snug text-[var(--text-secondary)]">
        Configure the interface and navigation controls.
      </p>

      <div className="mt-6 space-y-4">
        <AppearanceNavigationSection
          id="system-grey-settings"
          title="System grey"
          summary={`${activeSystemGray.label.replace('Gray', 'Grey')} · ${theme} mode`}
          active={selectedSection} section='system-grey'
          inline={inline}
          onOpen={() => onSectionOpen?.('system-grey')}
        >
          <SettingsGroup title="Grey intensity">
            <div
              role="radiogroup" onKeyDown={handleRadioGroupKeyDown}
              aria-label="Interface control system grey"
              className="side-panel-control-row w-full rounded-[10px] bg-[var(--surface-sunken)] p-1.5"
              style={{ transition }}
            >
              {systemGrays.map((option) => {
                const isSelected = option.id === systemGray;
                const swatch = theme === 'dark' ? option.dark : option.light;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected} tabIndex={isSelected ? 0 : -1}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => onSystemGrayChange(option.id)}
                    className="side-panel-primary-control side-panel-control-row flex-1 justify-center border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    style={{
                      backgroundColor: isSelected ? 'var(--surface-raised)' : 'transparent',
                      borderColor: isSelected ? 'var(--hairline)' : 'transparent',
                      boxShadow: isSelected && !highContrast ? 'var(--shadow-elevated)' : 'none',
                      transition
                    }}
                  >
                    <span
                      data-system-color=""
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{
                        ...swatchSurface(swatch),
                        boxShadow: `inset 0 0 0 1px ${theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)'}`,
                        transition
                      }}
                    >
                      {isSelected && (
                        <InterfaceIcon icon={CheckIcon} size="xs" weight="semibold" keepColor style={{ color: isLightSurface(swatch) ? '#1C1C1E' : '#FFFFFF' }} />
                      )}
                    </span>
                    <span
                      className="text-[11px] leading-none tabular-nums"
                      style={{
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: isSelected ? 600 : 500
                      }}
                    >
                      {option.id === 'gray' ? '1' : option.id.replace('gray', '')}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
              {activeSystemGray.label.replace('Gray', 'Grey')}, shown as it resolves in {theme} appearance.
            </p>
          </SettingsGroup>
        </AppearanceNavigationSection>

        <AppearanceNavigationSection
          id="appearance-settings"
          title="Appearance"
          summary={`${activeAppearance} · ${activeAccent.label}${highContrast ? ' · High contrast' : ''}`}
          active={selectedSection} section='appearance'
          inline={inline}
          onOpen={() => onSectionOpen?.('appearance')}
        >
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <SettingsGroup title="Interface appearance">
              <div
                role="radiogroup" onKeyDown={handleRadioGroupKeyDown}
                aria-label="Interface appearance"
                className="side-panel-control-row w-full rounded-[10px] bg-[var(--surface-sunken)] p-1.5"
                style={{ transition }}
              >
                {appearanceOptions.map((option) => {
                  const isSelected = appearanceMode === option.mode;
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      role="radio"
                      data-ui-control="button" data-control-size="md" data-control-variant="ghost"
                      aria-checked={isSelected} tabIndex={isSelected ? 0 : -1}
                      onClick={() => onAppearanceModeChange(option.mode)}
                      className="side-panel-primary-control side-panel-control-row flex-1 justify-center border text-[12px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      style={{
                        transition
                      }}
                    >
                      {isSelected && <InterfaceIcon icon={CheckIcon} size="xs" weight="semibold" />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
                {appearanceMode === 'auto' ? `Following the system; currently ${theme}.` : `Using ${theme} appearance.`}
              </p>
            </SettingsGroup>

            <SettingsGroup title="Accent color">
              <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Accent color" className="grid grid-cols-6 justify-items-center gap-1">
                {navAccents.map((option) => {
                  const swatch = theme === 'dark' ? option.dark : option.light;
                  const isSelected = option.id === activeAccent.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected} tabIndex={isSelected ? 0 : -1}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => onAccentColorChange(swatch)}
                      className="flex h-9 w-full min-w-0 max-w-9 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      <span
                        data-system-color=""
                        className="flex aspect-square w-6 max-w-full items-center justify-center rounded-full"
                        style={{
                          ...swatchSurface(swatch),
                          boxShadow: isSelected
                            ? '0 0 0 2px var(--surface-raised), 0 0 0 3.5px var(--text-primary)'
                            : `inset 0 0 0 1px ${theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)'}`,
                          transition
                        }}
                      >
                        {isSelected && (
                          <InterfaceIcon icon={CheckIcon} size="xs" weight="semibold" keepColor style={{ color: isLightSurface(swatch) ? '#1C1C1E' : '#FFFFFF' }} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </SettingsGroup>

            <SettingsGroup title="Visual styling">
              <div>
                <SwitchRow
                  label="High Contrast"
                  description="Strengthen card edges and text, and navigation states."
                  isOn={highContrast}
                  onToggle={() => onHighContrastChange(!highContrast)}
                  accent={accent}
                  transition={transition}
                  hasDivider
                />
                <SwitchRow
                  label="Reduce Translucency"
                  description="Use opaque system-gray surfaces instead."
                  isOn={reduceTranslucency}
                  onToggle={() => onReduceTranslucencyChange(!reduceTranslucency)}
                  accent={accent}
                  transition={transition}
                />
              </div>
            </SettingsGroup>
          </div>
        </AppearanceNavigationSection>

        {(!selectedSection || inline) && <div className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  resetResizablePanelLayout();
                  setLayoutWasReset(true);
                }}
                className="side-panel-primary-control side-panel-control-row shrink-0 border border-[var(--hairline)] bg-[var(--surface-sunken)] px-3 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <InterfaceIcon icon={layoutWasReset ? CheckIcon : RotateCcwIcon} size="xs" weight="semibold" />
                Reset layout
              </button>
          <span role="status" aria-live="polite" className="sr-only">{layoutWasReset ? 'Layout reset.' : ''}</span>
        </div>}
      </div>
    </section>
  );
}

function AppearanceNavigationSection({id, title, summary, active, section, onOpen, children, inline = false}: {
  id: string; title: string; summary: string; active: AppearanceSection | null; section: AppearanceSection; onOpen: () => void; children: React.ReactNode; inline?: boolean;
}) {
  if (inline) return <section className="overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-inset)]" data-appearance-dropdown={section}>
    <button type="button" onClick={onOpen} aria-expanded={active === section} aria-controls={`${id}-content`} className="side-panel-control-row side-panel-content-inset min-h-16 w-full py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-[var(--text-primary)]">{title}</span><span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{summary}</span></span>
      <InterfaceIcon icon={ChevronRightIcon} size="sm" weight="regular" mirroredInRtl className={`settings-chevron shrink-0${active === section ? ' settings-chevron-expanded' : ''}`} />
    </button>
    {active === section && <div id={`${id}-content`} className="p-2 sm:p-3">{children}</div>}
  </section>;
  if (active) return active === section ? <section className="overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-inset)]"><div id={`${id}-content`} className="p-2 sm:p-3">{children}</div></section> : null;
  return <section className="overflow-hidden rounded-[12px] border border-transparent bg-[var(--surface-inset)]">
    <button type="button" onClick={onOpen} className="side-panel-control-row side-panel-content-inset min-h-16 w-full py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-[var(--text-primary)]">{title}</span><span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{summary}</span></span>
      <InterfaceIcon icon={ChevronRightIcon} size="sm" weight="regular" mirroredInRtl className="shrink-0" />
    </button>
  </section>;
}
function SettingsGroup({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 p-3">
      <h3 className="mb-3 text-[14px] font-medium text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SwitchRow({
  label,
  description,
  isOn,
  onToggle,
  accent,
  transition,
  hasDivider
}: {
  label: string;
  description: string;
  isOn: boolean;
  onToggle: () => void;
  accent: string;
  transition: string;
  hasDivider?: boolean;
}) {
  const switchId = useId();
  return (
    <div
      className="flex min-h-[52px] items-center justify-between gap-6 py-1"
      style={{ borderBottom: hasDivider ? '1px solid var(--hairline)' : undefined }}
    >
      <label htmlFor={switchId} className="min-w-0">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="mt-0.5 block text-[12px] text-[var(--text-tertiary)]">{description}</span>
      </label>
      <AppearanceSwitch id={switchId} label={label} isOn={isOn} onToggle={onToggle} accent={accent} transition={transition} />
    </div>
  );
}
