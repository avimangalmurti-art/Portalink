import { readAccentColor, readAppearanceMode, readHighContrast, readReduceTranslucency, writeAccentColor, writeAppearanceMode, writeHighContrast, writeReduceTranslucency } from '../utils/appearancePreferences';
import type { PreferencesService } from './interfaces';

export const localPreferencesService: PreferencesService = {
  readAppearance() {
    return {
      mode: readAppearanceMode('dark'),
      accentColor: readAccentColor('#0A84FF'),
      highContrast: readHighContrast(true),
      reduceTranslucency: readReduceTranslucency(true),
    };
  },
  writeAppearance(preferences) {
    if (preferences.mode !== undefined) writeAppearanceMode(preferences.mode);
    if (preferences.accentColor !== undefined) writeAccentColor(preferences.accentColor);
    if (preferences.highContrast !== undefined) writeHighContrast(preferences.highContrast);
    if (preferences.reduceTranslucency !== undefined) writeReduceTranslucency(preferences.reduceTranslucency);
  },
};
