import { readThenNow } from '../../features/journey/journey';
import type { PublicCitationEvent, MediaKind } from '../../types/domain';

/** Public share rows only. Account IDs and owner-only profile preferences never
 * cross this boundary. Cover attachment metadata stays opaque for the existing
 * media mapper; the bundle is not a replacement for the full project viewer. */
export type SharedProfileRow = {
  show_outgoing_citations?: boolean;
  show_incoming_citations?: boolean;
  portfolio_headline?: string | null; school?: string; availability?: string; contact_email_public?: boolean; contact_email?: string | null; allow_pdf_download?: boolean; start_here_project_id?: string | null;
  show_journey?: boolean; then_now?: unknown;
  id: string; name: string; handle: string; headline: string; location: string;
  avatar_url: string; nav_heading: string; stats: unknown; social_links: unknown;
  links: unknown; is_private: false; public_appearance?: unknown; project_grid_columns?: number;
};
export type SharedCategoryRow = {
  id: string; profile_id: string; label: string; icon_name: string; format: string;
  blurb: string; position: number; is_hidden: false;
};
export type SharedProjectRow = {
  then_now_caption?: string | null;
  made_in?: string | null; field?: string | null; story_answers?: unknown;
  id: string; profile_id: string; category_id: string; title: string; summary: string;
  design: unknown; position: number; is_hidden: false; is_pinned: boolean;
  made_on?: string; citation_permitted?: boolean;
  published_at: string; revision: string; cover_thumbnail: unknown;
  topic_keys?: string[]; content_location?: string | null; page_count?: number; kind?: MediaKind | null; geographic_scope?: string;
  geography_confidence?: number;
};
export type SharedAttachmentRow = {
  id: string; project_id: string; kind: string; file_name: string; display_name: string;
  extension: string; mime_type: string; size_bytes: number; type_label: string;
  storage_path: string; status: string; is_cover: boolean; position: number; metadata: unknown;
};
export type SharedProfileBundle = {
  citations?: PublicCitationEvent[];
  profile: SharedProfileRow;
  categories: SharedCategoryRow[];
  projects: SharedProjectRow[];
  attachments: SharedAttachmentRow[];
};
type RpcError = { code?: string; message?: string; details?: string; hint?: string };
type RpcReply = { data: unknown; error: RpcError | null };
type SharedBundlePreload = { version: 1; profileId: string; startedAt: number; promise: PromiseLike<RpcReply> };
declare global {
  interface Window { __PORTALINK_SHARED_BUNDLE_PRELOAD__?: SharedBundlePreload }
}
export type SharedProfileBundleClient = {
  rpc: (name: 'shared_profile_bundle', args: { profile_id: string }) => PromiseLike<RpcReply>;
};
export type SharedProfileBundleResult =
  | { status: 'unsupported' }
  | { status: 'available'; bundle: SharedProfileBundle | null };

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const strings = (row: Record<string, unknown>, keys: string[]) => keys.every(key => typeof row[key] === 'string');
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value);
function invalid(): never { throw new Error('The shared profile bundle response is invalid.'); }
function uniqueIds(rows: Array<{ id: string }>) { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid(); }

/** A missing dependent function, permission denial, timeout, or malformed reply
 * must never silently switch to a broader reader. Match the called RPC itself. */
export function isMissingSharedProfileBundleRpc(error: unknown): boolean {
  if (!object(error) || (error.code !== 'PGRST202' && error.code !== '42883') || typeof error.message !== 'string') return false;
  return error.code === 'PGRST202'
    ? /^could not find the function\s+(?:public\.)?shared_profile_bundle\s*\([^)]*\).*schema cache/i.test(error.message)
    : /^function\s+(?:public\.)?shared_profile_bundle\s*\([^)]*\)\s+does not exist/i.test(error.message);
}

/** Strip unrecognized fields instead of exposing future private columns. */
export function parseSharedProfileBundle(value: unknown, expectedProfileId: string): SharedProfileBundle | null {
  if (value === null) return null;
  if (!object(value) || !object(value.profile) || !Array.isArray(value.categories)
    || !Array.isArray(value.projects) || !Array.isArray(value.attachments)) return invalid();
  const p = value.profile;
  if (!uuid(p.id) || p.id !== expectedProfileId || p.is_private !== false
    || !strings(p, ['name', 'handle', 'headline', 'location', 'avatar_url', 'nav_heading'])
    || !Array.isArray(p.stats) || !object(p.social_links) || !Array.isArray(p.links)
    || (p.project_grid_columns !== undefined && !integer(p.project_grid_columns))) return invalid();
  const profile: SharedProfileRow = {
    portfolio_headline: typeof p.portfolio_headline === 'string' ? p.portfolio_headline.slice(0,80) : null,
    school: typeof p.school === 'string' ? p.school.slice(0,120) : '',
    availability: typeof p.availability === 'string' ? p.availability.slice(0,120) : '',
    contact_email_public: p.contact_email_public === true,
    contact_email: p.contact_email_public === true && typeof p.contact_email === 'string' ? p.contact_email : null,
    allow_pdf_download: p.allow_pdf_download !== false,
    start_here_project_id: typeof p.start_here_project_id === 'string' ? p.start_here_project_id : null,
    show_outgoing_citations: p.show_outgoing_citations !== false,
    show_incoming_citations: p.show_incoming_citations !== false,
    show_journey: p.show_journey === true, then_now: null,
    id: p.id, name: p.name as string, handle: p.handle as string, headline: p.headline as string,
    location: p.location as string, avatar_url: p.avatar_url as string, nav_heading: p.nav_heading as string,
    stats: p.stats, social_links: p.social_links, links: p.links, is_private: false,
    ...(p.public_appearance !== undefined ? { public_appearance: p.public_appearance } : {}),
    ...(p.project_grid_columns !== undefined ? { project_grid_columns: p.project_grid_columns as number } : {}),
  };
  const categories: SharedCategoryRow[] = value.categories.map(row => {
    if (!object(row) || !uuid(row.id) || row.profile_id !== p.id || row.is_hidden !== false
      || !strings(row, ['label', 'icon_name', 'format', 'blurb']) || !integer(row.position)) return invalid();
    return { id: row.id, profile_id: p.id as string, label: row.label as string, icon_name: row.icon_name as string,
      format: row.format as string, blurb: row.blurb as string, position: row.position as number, is_hidden: false };
  });
  uniqueIds(categories);
  const categoryIds = new Set(categories.map(row => row.id));
  const projects: SharedProjectRow[] = value.projects.map(row => {
    if (!object(row) || !uuid(row.id) || row.profile_id !== p.id || !uuid(row.category_id) || !categoryIds.has(row.category_id)
      || row.is_hidden !== false || typeof row.is_pinned !== 'boolean' || !uuid(row.revision)
      || !strings(row, ['title', 'summary', 'published_at']) || !Number.isFinite(Date.parse(row.published_at as string))
      || !integer(row.position) || !('design' in row) || !('cover_thumbnail' in row)
      || (row.cover_thumbnail !== null && !object(row.cover_thumbnail))
      || (row.topic_keys !== undefined && (!Array.isArray(row.topic_keys) || row.topic_keys.some(key => typeof key !== 'string')))
      || (row.content_location !== undefined && row.content_location !== null && typeof row.content_location !== 'string')
      || (row.page_count !== undefined && (!integer(row.page_count) || (row.page_count as number) < 0))
      || (row.kind !== undefined && row.kind !== null && !['image', 'video', 'audio', 'document', 'model3d', 'unknown'].includes(row.kind as string))
      || (row.geographic_scope !== undefined && typeof row.geographic_scope !== 'string')
      || (row.geography_confidence !== undefined && (typeof row.geography_confidence !== 'number' || !Number.isFinite(row.geography_confidence)))) return invalid();
    return { id: row.id, profile_id: p.id as string, category_id: row.category_id, title: row.title as string,
      made_on: typeof row.made_on==='string'?row.made_on:undefined,
      citation_permitted: row.citation_permitted===true,
      summary: row.summary as string, design: row.design, position: row.position as number, is_hidden: false,
      is_pinned: row.is_pinned, published_at: row.published_at as string, revision: row.revision,
      cover_thumbnail: row.cover_thumbnail,
      ...(typeof row.then_now_caption === 'string' || row.then_now_caption === null ? { then_now_caption: row.then_now_caption } : {}),
      ...(typeof row.made_in === 'string' || row.made_in === null ? { made_in: row.made_in } : {}),
      ...(typeof row.field === 'string' || row.field === null ? { field: row.field } : {}),
      ...(object(row.story_answers) || row.story_answers === null ? { story_answers: row.story_answers } : {}),
      ...(row.topic_keys !== undefined ? { topic_keys: row.topic_keys as string[] } : {}),
      ...(row.content_location !== undefined ? { content_location: row.content_location as string | null } : {}),
      ...(row.page_count !== undefined ? { page_count: row.page_count as number } : {}),
      ...(row.kind !== undefined ? { kind: row.kind as MediaKind | null } : {}),
      ...(row.geographic_scope !== undefined ? { geographic_scope: row.geographic_scope as string } : {}),
      ...(row.geography_confidence !== undefined ? { geography_confidence: row.geography_confidence as number } : {}),
    };
  });
  uniqueIds(projects);
  const projectIds = new Set(projects.map(row => row.id));
  if (!profile.start_here_project_id || !projectIds.has(profile.start_here_project_id)) profile.start_here_project_id = null;
  const pair = readThenNow(p.then_now);
  if (profile.show_journey && pair && projectIds.has(pair.then) && projectIds.has(pair.now)) profile.then_now = pair;
  const counts = new Map<string, number>();
  const attachments: SharedAttachmentRow[] = value.attachments.map(row => {
    if (!object(row) || !strings(row, ['id', 'kind', 'file_name', 'display_name', 'extension', 'mime_type', 'type_label', 'storage_path', 'status'])
      || !row.id || !uuid(row.project_id) || !projectIds.has(row.project_id) || typeof row.is_cover !== 'boolean'
      || !integer(row.position) || !integer(row.size_bytes) || (row.size_bytes as number) < 0
      || !('metadata' in row) || (row.metadata !== null && !object(row.metadata))) return invalid();
    const count = (counts.get(row.project_id) ?? 0) + 1;
    counts.set(row.project_id, count);
    if (count > 2) return invalid();
    return { id: row.id as string, project_id: row.project_id, kind: row.kind as string,
      file_name: row.file_name as string, display_name: row.display_name as string, extension: row.extension as string,
      mime_type: row.mime_type as string, size_bytes: row.size_bytes as number, type_label: row.type_label as string,
      storage_path: row.storage_path as string, status: row.status as string, is_cover: row.is_cover,
      position: row.position as number, metadata: row.metadata };
  });
  uniqueIds(attachments);
  let citations: PublicCitationEvent[] | undefined;
  if(value.citations!==undefined){
    if(!Array.isArray(value.citations))return invalid();
    citations=value.citations.map(row=>{
      if(!object(row)||!uuid(row.id)||!uuid(row.other_project_id)||!uuid(row.other_profile_id)||!uuid(row.other_category_id)
        ||!['incoming','outgoing'].includes(row.direction as string)
        ||!strings(row,['item_id','label','other_creator_name','other_creator_handle','other_project_title','citing_project_title','created_at'])
        ||!Number.isFinite(Date.parse(row.created_at as string))
        ||(row.note!==null&&(typeof row.note!=='string'||row.note.length>140)))return invalid();
      return {id:row.id,direction:row.direction as PublicCitationEvent['direction'],item_id:row.item_id as string,
        label:row.label as string,other_creator_name:row.other_creator_name as string,other_creator_handle:row.other_creator_handle as string,
        other_project_id:row.other_project_id,other_project_title:row.other_project_title as string,
        other_profile_id:row.other_profile_id,other_category_id:row.other_category_id,
        citing_project_title:row.citing_project_title as string,created_at:row.created_at as string,note:row.note as string|null};
    });
    uniqueIds(citations);
  }
  return { profile, categories, projects, attachments, ...(citations!==undefined?{citations}:{}) };
}

/** Single-use document preload; retries, later routes and invalidations read
 * fresh data. This anonymous response never becomes an authenticated cache. */
function takeSharedBundlePreload(profileId: string): PromiseLike<RpcReply> | null {
  if (typeof window === 'undefined') return null;
  const preload = window.__PORTALINK_SHARED_BUNDLE_PRELOAD__;
  delete window.__PORTALINK_SHARED_BUNDLE_PRELOAD__;
  if (!preload || preload.version !== 1 || preload.profileId !== profileId.toLowerCase()
    || !Number.isFinite(preload.startedAt) || Date.now() - preload.startedAt < 0 || Date.now() - preload.startedAt > 30_000
    || !preload.promise || typeof preload.promise.then !== 'function') return null;
  return preload.promise;
}

export async function readSharedProfileBundle(client: SharedProfileBundleClient, profileId: string): Promise<SharedProfileBundleResult> {
  if (!uuid(profileId)) throw new Error('A valid profile ID is required.');
  const normalizedId = profileId.toLowerCase();
  const { data, error } = await (takeSharedBundlePreload(normalizedId) ?? client.rpc('shared_profile_bundle', { profile_id: normalizedId }));
  if (error) {
    if (isMissingSharedProfileBundleRpc(error)) return { status: 'unsupported' };
    throw new Error(error.message || 'The shared profile could not be loaded.');
  }
  return { status: 'available', bundle: parseSharedProfileBundle(data, normalizedId) };
}
