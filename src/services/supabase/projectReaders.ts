import type { ProjectService } from '../interfaces';
import type { ProjectView } from '../../types/domain';
import { ProjectMutationError } from '../../types/publishing';
import { requireSupabase } from './client';
import { hydrateProjects, asDesign, throwProfileError, supabaseProfileReadService } from './contentReaders';
import type { ProfileRow, CategoryRow, ProjectRow, AttachmentRow } from './contentReaders';

async function loadRequestedProjectViews(projectIds: string[]): Promise<ProjectView[]> {
  const requestedIds = [...new Set(projectIds)];
  if (requestedIds.length === 0) return [];
  const client = requireSupabase();
  const projectResult = await client
    .from('projects')
    .select('*')
    .in('id', requestedIds);
  if (projectResult.error) throw new Error(projectResult.error.message);
  const projectRows = (projectResult.data ?? []) as unknown as ProjectRow[];
  if (projectRows.length === 0) return [];

  const profileIds = [...new Set(projectRows.map((row) => row.profile_id))];
  const categoryIds = [...new Set(projectRows.map((row) => row.category_id))];
  const [profileResult, categoryResult, attachmentResult] = await Promise.all([
    client.from('profiles').select('id,name,headline,avatar_url,location,is_private').in('id', profileIds),
    client.from('portfolio_categories').select('id,label').in('id', categoryIds),
    client.from('project_attachments').select('*').in('project_id', requestedIds).order('position'),
  ]);
  if (profileResult.error) throwProfileError(profileResult.error, 'Project creators could not be loaded.');
  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (attachmentResult.error) throw new Error(attachmentResult.error.message);

  const creatorRows = (profileResult.data ?? []) as unknown as Array<Pick<ProfileRow, 'id' | 'name' | 'headline' | 'avatar_url' | 'location' | 'is_private'>>;
  const categoryRows = (categoryResult.data ?? []) as unknown as Array<Pick<CategoryRow, 'id' | 'label'>>;
  // Project RLS and category RLS are separate. A hidden category must not become
  // visible merely because its project id is known. Owners can read their own
  // hidden categories through the existing category policy.
  const readableCategories = new Set(categoryRows.map((row) => row.id));
  const readableCreators = new Set(creatorRows.map((row) => row.id));
  const readableProjects = projectRows.filter((row) => readableCategories.has(row.category_id) && readableCreators.has(row.profile_id));
  const readableIds = new Set(readableProjects.map((row) => row.id));
  const attachmentRows = ((attachmentResult.data ?? []) as unknown as AttachmentRow[]).filter((row) => readableIds.has(row.project_id));
  const projectsById = await hydrateProjects(readableProjects, categoryRows, attachmentRows);
  const creatorsById = new Map(creatorRows.map((row) => [row.id, {
    id: row.id,
    name: row.name,
    kind: row.headline,
    avatar: row.avatar_url,
    location: row.location,
    isPrivate: row.is_private,
  }]));
  const viewsById = new Map<string, ProjectView>();
  projectRows.forEach((row) => {
    const project = projectsById.get(row.id);
    const creator = creatorsById.get(row.profile_id);
    if (project && creator) viewsById.set(row.id, { project, creator });
  });
  return projectIds.map((id) => viewsById.get(id)).filter((view): view is ProjectView => Boolean(view));
}

export const supabaseProjectReadService: Pick<ProjectService, 'getProject' | 'getProjectView' | 'listProjectViews' | 'listProjects' | 'getProjectDesign' | 'listProjectDesigns'> = {
async getProject(projectId) {
    return (await this.getProjectView(projectId)).project;
  },

async getProjectView(projectId) {
    const view = (await loadRequestedProjectViews([projectId]))[0];
    if (!view) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return view;
  },

async listProjectViews(projectIds) {
    return loadRequestedProjectViews(projectIds);
  },

async listProjects(profileId, categoryId) {
    const projects = (await supabaseProfileReadService.getProfile(profileId)).projects;
    return categoryId ? projects.filter((project) => project.categoryId === categoryId) : projects;
  },

async getProjectDesign(projectId) {
    const designs = await this.listProjectDesigns([projectId]);
    if (!designs[projectId]) throw new ProjectMutationError('not_found', 'That project could not be found.');
    return designs[projectId];
  },

async listProjectDesigns(projectIds) {
    if (projectIds.length === 0) return {};
    const client = requireSupabase();
    const { data, error } = await client.from('projects').select('id,category_id,design').in('id', [...new Set(projectIds)]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Pick<ProjectRow, 'id' | 'category_id' | 'design'>>;
    if (rows.length === 0) return {};
    const categories = await client.from('portfolio_categories').select('id').in('id', [...new Set(rows.map((row) => row.category_id))]);
    if (categories.error) throw new Error(categories.error.message);
    const readableIds = new Set((categories.data ?? []).map((row) => row.id));
    return Object.fromEntries(rows.filter((row) => readableIds.has(row.category_id)).map((row) => [row.id, asDesign(row.design) ?? { typefaceId: 'default' }]));
  }
};

export { loadRequestedProjectViews };
