import type { AnalyticsService, CommerceService, LiveService } from '../interfaces';

const unavailable = (capability: string): Error => new Error(
  `${capability} is not available because its production service has not been connected.`,
);

/**
 * Production-safe service implementations for domains that do not have a
 * durable backend yet. They never return fixture data or claim that work ran.
 */
export const unavailableLiveService: LiveService = {
  async listLocations() {
    return [];
  },
  async listSessions() {
    return [];
  },
  async getLiveCapability() {
    return {
      isRealtime: false,
      isDurable: false,
      reason: 'Live broadcasting is not available yet.',
    };
  },
  async joinSession() {
    throw unavailable('Live broadcasting');
  },
  async leaveSession() {
    throw unavailable('Live broadcasting');
  },
};

export const unavailableAnalyticsService: AnalyticsService = {
  async getCreatorAnalytics() {
    throw unavailable('Creator analytics');
  },
  async getGenerativeCapability() {
    return {
      isAvailable: false,
      reason: 'Studio generation is not available yet.',
    };
  },
  async requestLayoutRevision() {
    return {
      didGenerate: false,
      changedContent: false,
      message: 'No layout revision was generated. Your project is unchanged.',
    };
  },
  async simulateDraft() {
    return {
      didGenerate: false,
      changedContent: false,
      message: 'No draft simulation was run. Your files are unchanged.',
    };
  },
  async synthesizeCrossMedia() {
    return {
      didGenerate: false,
      changedContent: false,
      message: 'No cross-media synthesis was run. Your projects are unchanged.',
    };
  },
};

export const unavailableCommerceService: CommerceService = {
  async getProduct() {
    throw unavailable('Commerce');
  },
};
