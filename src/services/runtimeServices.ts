import { services as connected } from './productionServices';
import { mockAnalyticsService, mockCommentService, mockCommerceService, mockDiscoveryService, mockEngagementService, mockLiveService, mockMediaService, mockMessagingService, mockNotificationService, mockProfileService, mockProjectService, mockSearchService, mockSocialService } from './mocks';
import { prototypeAuthService } from './prototype/authService';
import { isProductionRuntime, isSupabaseConfigured } from './supabase/client';
import { unavailableCreatorSaveService } from './supabase/creatorSaveService';
import type { Services } from './interfaces';

// Development and explicitly requested prototype builds retain the existing
// runtime choice. Real configuration always selects durable account/content APIs.
export const services: Services = {
  ...connected,
  ...(!isSupabaseConfigured ? {
    auth: prototypeAuthService,
    profiles: mockProfileService,
    projects: mockProjectService,
    media: mockMediaService,
    discovery: mockDiscoveryService,
    search: mockSearchService,
    social: mockSocialService,
    engagement: mockEngagementService,
    creatorSaves: unavailableCreatorSaveService,
    comments: mockCommentService,
    notifications: mockNotificationService,
    messaging: mockMessagingService,
  } : {}),
  ...(!isProductionRuntime ? {
    live: mockLiveService,
    analytics: mockAnalyticsService,
    commerce: mockCommerceService,
  } : {}),
};
