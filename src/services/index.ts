/**
 * The single place implementations are chosen.
 *
 * To connect a production service, swap one entry:
 *
 *   profiles: new ApiProfileService(httpClient),
 *
 * Nothing else in the app imports a mock directly — components resolve services
 * from `useServices()`, which reads this registry through a context.
 */

import { localGeographyService, localPreferencesService, mockAnalyticsService, mockCommentService, mockCommerceService, mockDiscoveryService, mockEngagementService, mockLiveService, mockMediaService, mockMessagingService, mockNotificationService, mockProfileService, mockProjectService, mockSearchService, mockSocialService } from './mocks';
import { prototypeAuthService } from './prototype/authService';
import { isProductionRuntime, isSupabaseConfigured } from './supabase/client';
import { supabaseAuthService } from './supabase/authService';
import {
  supabaseDiscoveryService,
  supabaseProfileService,
  supabaseProjectService,
  supabaseSearchService,
} from './supabase/contentServices';
import { supabaseMediaService } from './supabase/mediaService';
import {
  supabaseCommentService,
  supabaseEngagementService,
  supabaseNotificationService,
  supabaseSocialService,
} from './supabase/communityServices';
import { supabaseMessagingService } from './supabase/messagingService';
import { supabaseCreatorSaveService, unavailableCreatorSaveService } from './supabase/creatorSaveService';
import {
  unavailableAnalyticsService,
  unavailableCommerceService,
  unavailableLiveService,
} from './unavailable';
import type { Services } from './interfaces';
export const services: Services = {
  // A configured deployment is durable; a checkout without credentials remains
  // the original truthful prototype for design review.
  auth: isSupabaseConfigured ? supabaseAuthService : prototypeAuthService,
  profiles: isSupabaseConfigured ? supabaseProfileService : mockProfileService,
  projects: isSupabaseConfigured ? supabaseProjectService : mockProjectService,
  media: isSupabaseConfigured ? supabaseMediaService : mockMediaService,
  discovery: isSupabaseConfigured ? supabaseDiscoveryService : mockDiscoveryService,
  search: isSupabaseConfigured ? supabaseSearchService : mockSearchService,
  social: isSupabaseConfigured ? supabaseSocialService : mockSocialService,
  engagement: isSupabaseConfigured ? supabaseEngagementService : mockEngagementService,
  creatorSaves: isSupabaseConfigured ? supabaseCreatorSaveService : unavailableCreatorSaveService,
  comments: isSupabaseConfigured ? supabaseCommentService : mockCommentService,
  notifications: isSupabaseConfigured ? supabaseNotificationService : mockNotificationService,
  messaging: isSupabaseConfigured ? supabaseMessagingService : mockMessagingService,
  // Production never substitutes invented sessions, metrics, products, or AI
  // output. Unimplemented domains are explicit capabilities until a durable
  // backend is connected.
  live: isProductionRuntime ? unavailableLiveService : mockLiveService,
  analytics: isProductionRuntime ? unavailableAnalyticsService : mockAnalyticsService,
  commerce: isProductionRuntime ? unavailableCommerceService : mockCommerceService,
  geography: localGeographyService,
  preferences: localPreferencesService
};
export type { Services } from './interfaces';
