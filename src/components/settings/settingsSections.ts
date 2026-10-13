export const SETTINGS_SECTIONS = ['appearance', 'account', 'invite', 'privacy', 'notifications', 'language', 'about'] as const;
export type SettingsSectionId = typeof SETTINGS_SECTIONS[number];
export function readSettingsSection(value: string | null): SettingsSectionId | null {
  return SETTINGS_SECTIONS.find(id => id === value) ?? null;
}
export function settingsSectionParams(params: URLSearchParams, section: SettingsSectionId | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (section !== 'appearance') next.delete('panel');
  if (section) next.set('section', section); else next.delete('section');
  return next;
}
