import { readSignalService, withPageNotifications } from './supabase/readSignalService';
import { supabaseAuthService } from './supabase/authService';
import { supabaseDiscoveryService, supabaseProfileService, supabaseProjectService } from './supabase/contentServices';
import { supabaseMediaService } from './supabase/mediaService';
import { supabaseCommentService, supabaseEngagementService, supabaseNotificationService, supabaseSocialService } from './supabase/communityServices';
import { supabaseMessagingService } from './supabase/messagingService';
import { supabaseCreatorSaveService } from './supabase/creatorSaveService';
import { unavailableLiveService } from './unavailable';
import { localGeographyService } from './local';
import type { Services } from './interfaces';

// Importing the connected services retains client.ts's fail-closed production
// configuration checks. This entry has no prototype implementation or seed data.
export const services: Services = {
  auth: supabaseAuthService,
  profiles: supabaseProfileService,
  projects: supabaseProjectService,
  media: supabaseMediaService,
  discovery: supabaseDiscoveryService,
  social: supabaseSocialService,
  engagement: supabaseEngagementService,
  creatorSaves: supabaseCreatorSaveService,
  comments: supabaseCommentService,
  notifications: withPageNotifications(supabaseNotificationService),
  reads: readSignalService,
  messaging: supabaseMessagingService,
  live: unavailableLiveService,
  geography: localGeographyService,
};
