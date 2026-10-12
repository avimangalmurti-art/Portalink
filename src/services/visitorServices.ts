import { profileSharing } from './supabase/profileSharing';
import type { Services } from './interfaces';
import type { LegalService } from '../features/legal/model';
import { supabaseAuthService } from './supabase/authService';
import { supabaseProfileReadService } from './supabase/contentReaders';
import { deferredService, unavailableVisitorService } from './deferredService';

const projectReads = deferredService(() => import('./supabase/projectReaders').then(module => module.supabaseProjectReadService));
const processingReads = deferredService(() => import('./supabase/mediaProcessingReads').then(module => module.supabaseMediaProcessingReadService));

/** Public entry: canonical reads now, account actions only when requested.
 * The full registry, mock data, uploads and messaging never initialize here. */
export const visitorServices: Services = {
  legal: deferredService<LegalService>(() => import('./supabase/legalService').then(module => module.supabaseLegalService)),
  auth: supabaseAuthService,
  profiles: deferredService(() => import('./supabase/contentServices').then(module => module.supabaseProfileService), {
    resolvePublicHandle: profileSharing.resolvePublicHandle,
    getShareAddress: profileSharing.getShareAddress,
    getSharedProfile: supabaseProfileReadService.getSharedProfile,
    getProjectGridLayout: supabaseProfileReadService.getProjectGridLayout,
    // A visitor cache is always public, even for a signed-in owner following
    // their own share link. Ordinary owner reads retain their separate registry.
    getProfile: profileId => supabaseProfileReadService.getSharedProfile(profileId),
  }),
  projects: deferredService(() => import('./supabase/contentServices').then(module => module.supabaseProjectService), {
    getProject: projectReads.getProject,
    getProjectView: projectReads.getProjectView,
    listProjectViews: projectReads.listProjectViews,
    listProjects: projectReads.listProjects,
    getProjectDesign: projectReads.getProjectDesign,
    listProjectDesigns: projectReads.listProjectDesigns,
  }),
  media: deferredService(() => import('./supabase/mediaService').then(module => module.supabaseMediaService), {
    getProcessingCapability: processingReads.getProcessingCapability,
    getProcessingStatus: processingReads.getProcessingStatus,
  }),
  social: deferredService(() => import('./supabase/communityServices').then(module => module.supabaseSocialService)),
  engagement: deferredService(() => import('./supabase/communityServices').then(module => module.supabaseEngagementService)),
  comments: deferredService(() => import('./supabase/communityServices').then(module => module.supabaseCommentService)),
  creatorSaves: deferredService(() => import('./supabase/creatorSaveService').then(module => module.supabaseCreatorSaveService)),
  discovery: unavailableVisitorService('Home'),
  notifications: unavailableVisitorService('Notifications'),
  messaging: unavailableVisitorService('Messages'),
  live: unavailableVisitorService('Live'),
  geography: unavailableVisitorService('Discover'),
};
