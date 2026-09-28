import { supabaseAuthService } from './supabase/authService';
import { supabaseDiscoveryService, supabaseProfileService, supabaseProjectService, supabaseSearchService } from './supabase/contentServices';
import { supabaseMediaService } from './supabase/mediaService';
import { supabaseCommentService, supabaseEngagementService, supabaseNotificationService, supabaseSocialService } from './supabase/communityServices';
import { supabaseMessagingService } from './supabase/messagingService';
import { supabaseCreatorSaveService } from './supabase/creatorSaveService';
import { unavailableAnalyticsService, unavailableCommerceService, unavailableLiveService } from './unavailable';
import { localGeographyService, localPreferencesService } from './local';
import type { Services } from './interfaces';

// Importing the connected services retains client.ts's fail-closed production
// configuration checks. This entry has no prototype implementation or seed data.
export const services: Services = {
  auth: supabaseAuthService,
  profiles: supabaseProfileService,
  projects: supabaseProjectService,
  media: supabaseMediaService,
  discovery: supabaseDiscoveryService,
  search: supabaseSearchService,
  social: supabaseSocialService,
  engagement: supabaseEngagementService,
  creatorSaves: supabaseCreatorSaveService,
  comments: supabaseCommentService,
  notifications: supabaseNotificationService,
  messaging: supabaseMessagingService,
  live: unavailableLiveService,
  analytics: unavailableAnalyticsService,
  commerce: unavailableCommerceService,
  geography: localGeographyService,
  preferences: localPreferencesService,
};
