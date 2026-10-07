import { requireSupabase } from './client';
import type { ProjectCreationDetails } from '../../types/domain';
import { isMissingCreationColumn } from '../../features/publishing/firstProject';

/** Preserve unrelated JSON and refuse a concurrent writer instead of erasing it. */
export async function mergeProjectDesign(projectId: string, patch: Record<string, unknown>) {
  const client = requireSupabase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await client.from('projects').select('design,revision').eq('id', projectId).single();
    if (current.error) throw new Error(current.error.message);
    const row = current.data as { design: Record<string, unknown> | null; revision: string };
    const saved = await client.from('projects').update({ design: { ...row.design, ...patch }, revision: crypto.randomUUID() })
      .eq('id', projectId).eq('revision', row.revision).select('id').maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    if (saved.data) return;
  }
  throw new Error('This project changed in another window. Try saving the details again.');
}
export async function saveProjectCreationDetails(projectId: string, details: ProjectCreationDetails) {
  const result = await requireSupabase().from('projects').update({ made_in: details.madeIn || null, field: details.field.trim() || null, story_answers: details.answers })
    .eq('id', projectId).select('id').single();
  if (!result.error) return;
  if (!isMissingCreationColumn(result.error)) throw new Error(result.error.message);
  await mergeProjectDesign(projectId, { projectContext: details });
}

/** One guarded write, including legacy JSON when columns are absent. A failure
 * leaves every Journey field unchanged; retries never upload project media. */
export async function saveProjectJourneyDetails(projectId: string, details: ProjectCreationDetails, caption: string) {
  if (details.madeIn && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(details.madeIn)) throw new Error('Choose a valid month and year.');
  if (caption.trim().length > 180) throw new Error('Keep the Then/Now caption to 180 characters.');
  const client = requireSupabase();
  for (let attempt = 0; attempt < 3; attempt++) {
    // select('*') works before and after the pending columns are installed.
    const current = await client.from('projects').select('*').eq('id', projectId).single();
    if (current.error) throw new Error(current.error.message);
    const row = current.data as Record<string, unknown>;
    const patch: Record<string, unknown> = { revision: crypto.randomUUID() };
    const legacy: Record<string, unknown> = {};
    if (['made_in', 'field', 'story_answers'].every(key => Object.prototype.hasOwnProperty.call(row, key))) {
      Object.assign(patch, { made_in: details.madeIn || null, field: details.field.trim() || null, story_answers: details.answers });
    } else legacy.projectContext = details;
    if (Object.prototype.hasOwnProperty.call(row, 'then_now_caption')) patch.then_now_caption = caption.trim() || null;
    else legacy.journeyCaption = caption.trim();
    if (Object.keys(legacy).length) patch.design = { ...(row.design as Record<string, unknown> | null), ...legacy };
    const saved = await client.from('projects').update(patch).eq('id', projectId).eq('revision', row.revision).select('id').maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    if (saved.data) return;
  }
  throw new Error('This project changed in another window. Try saving the details again.');
}
