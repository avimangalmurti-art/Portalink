import type { ProjectAttachment } from '../../types/domain';
export const REACH_BUCKETS = ['<400', '400-639', '640-1023', '1024-1439', '1440+'] as const;
export const REF_CLASSES = ['own-link', 'messages', 'linkedin', 'other'] as const;
export type ReachPayload = {
    project_id: string;
    session_token: string;
    furthest_page: number;
    page_count: number;
    ref_class: typeof REF_CLASSES[number];
    vw_bucket: typeof REACH_BUCKETS[number];
};
export type ReadPage = {
    page: number;
    attachmentId: string;
    pageIndex: number;
};
export type ReachSummary = {
    projectId: string;
    title: string;
    profileId: string;
    categoryId: string;
    pageCount: number;
    opened: number;
    finished: number;
    saved: number;
    comments: number;
    reach: number[];
    savedByPage: number[];
    commentsByPage: number[];
    refs: Record<string, number>;
    pages: ReadPage[];
    weekly: {
        opened: number;
        finished: number;
        refs: Record<string, number>;
    };
};
export type ReadActor = {
    id: string;
    name: string;
    avatar: string | null;
    action: 'save' | 'comment';
    at: string;
    body?: string;
};
export type ReadDetail = {
    page: number;
    saved: number;
    comments: number;
    reached: number;
    actors: ReadActor[];
};
export interface ReadSignalService {
    list(): Promise<ReachSummary[]>;
    summary(projectId: string): Promise<ReachSummary>;
    detail(projectId: string, page: number): Promise<ReadDetail>;
    weekly(week: string): Promise<void>;
}
export const viewportBucket = (width: number): ReachPayload['vw_bucket'] => width < 400 ? '<400' : width < 640 ? '400-639' : width < 1024 ? '640-1023' : width < 1440 ? '1024-1439' : '1440+';
export function classifyReferrer(referrer: string, via: string | null, ownOrigin: string): ReachPayload['ref_class'] {
    if (via === 'messages')
        return 'messages';
    if (via === 'linkedin')
        return 'linkedin';
    if (via)
        return 'own-link';
    try {
        const url = new URL(referrer);
        if (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'))
            return 'linkedin';
        if (url.origin === ownOrigin)
            return url.pathname.startsWith('/messages') ? 'messages' : 'own-link';
    }
    catch { /* No referrer is a direct link. */ }
    return referrer ? 'other' : 'own-link';
}
/** Project order, with the same image-sequence page indexes used by page actions. */
export function projectPageMap(attachments: readonly Pick<ProjectAttachment, 'id' | 'kind' | 'order' | 'metadata'>[], resolved: Record<string, number> = {}): ReadPage[] {
    const ordered = attachments.slice().sort((a, b) => a.order - b.order), images = ordered.filter(a => a.kind === 'image');
    const result: ReadPage[] = [];
    for (const item of ordered) {
        const count = item.kind === 'document' ? (resolved[item.id] ?? item.metadata?.pageCount) : 1;
        if (!Number.isInteger(count) || !count || count < 1 || count > 10000)
            return [];
        for (let index = 0; index < count; index++)
            result.push({ page: result.length, attachmentId: item.id, pageIndex: item.kind === 'image' ? images.findIndex(image => image.id === item.id) : index });
        if (result.length > 10000)
            return [];
    }
    return result;
}
export function bucketReach(reach: readonly number[], saved: readonly number[], max = 40) {
    const width = Math.max(1, Math.ceil(reach.length / max));
    const mostSaved = saved.some(n => n > 0) ? saved.indexOf(Math.max(...saved)) : -1;
    return Array.from({ length: Math.ceil(reach.length / width) }, (_, index) => {
        const start = index * width, end = Math.min(reach.length - 1, start + width - 1);
        return { start, end, count: reach[start] ?? 0, highlighted: mostSaved >= start && mostSaved <= end, detailPage: mostSaved >= start && mostSaved <= end ? mostSaved : start };
    });
}
export function dropSentence(reach: readonly number[]): string | null {
    if ((reach[0] ?? 0) < 5)
        return null;
    for (let index = 1; index < reach.length; index++)
        if (reach[index - 1] - reach[index] >= Math.max(3, Math.ceil(reach[0] * .3)))
            return `There is a clear drop after page ${index}.`;
    return null;
}
/** Local Sunday after18:00 only. Stable local date, never a inferred timezone. */
export function weeklyGate(now: Date): string | null {
    if (now.getDay() !== 0 || now.getHours() < 18)
        return null;
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function currentWeek(now: Date): string {
    const start = new Date(now);
    const days = (now.getDay() + 6) % 7;
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}
export function pageActionCopy(name: string, kind: 'save' | 'comment', page: number, title: string, heading?: string, count = 1): string {
    if (kind === 'save' && count > 1)
        return `${count} people have now saved page ${page + 1} of ${title}${heading ? ` — ${heading}` : ''}`;
    return `${name} ${kind === 'save' ? 'saved' : 'commented on'} page ${page + 1} of ${title}${heading ? ` — ${heading}` : ''}`;
}
