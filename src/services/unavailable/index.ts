import type { LiveService } from '../interfaces';

const unavailable = (capability: string): Error => new Error(
  `${capability} is not available because its production service has not been connected.`,
);

/**
 * Production-safe service implementations for domains that do not have a
 * durable backend yet. They never return fixture data or claim that work ran.
 */
export const unavailableLiveService: LiveService = {
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
