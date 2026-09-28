import { localGeography } from '../data/geography';
import { readAccentColor, readAppearanceMode, readHighContrast, readReduceTranslucency, writeAccentColor, writeAppearanceMode, writeHighContrast, writeReduceTranslucency } from '../utils/appearancePreferences';
import type { GeographyService, PreferencesService } from './interfaces';

/** These services are local in both connected and prototype environments. */
export const localGeographyService: GeographyService = {
  readLocalGeography: () => localGeography,
  async getVisibleGeography() {
    // The frontend still owns visibility/level-of-detail for this local dataset.
    return localGeography;
  },
};

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
