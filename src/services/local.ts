import { localGeography } from '../data/geography';
import type { GeographyService } from './interfaces';

/** These services are local in both connected and prototype environments. */
export const localGeographyService: GeographyService = {
  readLocalGeography: () => localGeography,
  async getVisibleGeography() {
    // The frontend still owns visibility/level-of-detail for this local dataset.
    return localGeography;
  },
};

export { localPreferencesService } from './localPreferences';
