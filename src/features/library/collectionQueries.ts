import type { CreatorSaveService, ProfileService, ProjectService } from '../../services/interfaces';
import { ProfileServiceError } from '../../types/profile';
import { listSavedPages, savedPagePresentation } from './savedPages';

/** Shared by the Saved gallery and Studio: resolve only current, authorized content. */
export async function loadSavedCreators(creatorSaves: CreatorSaveService, profiles: ProfileService) {
  const ids = await creatorSaves.listSavedCreatorIds();
  return Promise.all(ids.map(async (id) => {
    try { return { id, profile: await profiles.getProfile(id) }; }
    catch (error) {
      if (error instanceof ProfileServiceError && error.code === 'not_found') return { id, profile: null };
      throw error;
    }
  }));
}

export async function loadSavedPageBatch(projects: ProjectService, cursor: string | null) {
  const batch = await listSavedPages(cursor);
  const ids = [...new Set(batch.items.map((item) => item.projectId))];
  const views = await Promise.all(ids.map(async (id) => {
    try { return await projects.getProjectView(id); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'not_found') return undefined;
      throw error;
    }
  }));
  const byId = new Map(views.filter((view) => view !== undefined).map((view) => [view.project.id, view]));
  return {
    nextCursor: batch.nextCursor,
    items: batch.items.map((target) => ({ target, presentation: savedPagePresentation(target, byId.get(target.projectId)) })),
  };
}

export type SavedCreatorEntry = Awaited<ReturnType<typeof loadSavedCreators>>[number];
export type SavedPageEntry = Awaited<ReturnType<typeof loadSavedPageBatch>>['items'][number];
export type ResolvedSavedPageBatch = Awaited<ReturnType<typeof loadSavedPageBatch>>;
