import { mediaInteractionRequest } from '../../features/media-interactions/mediaInteractionRequest';
import type { ReadSignalService, ReachSummary, ReadDetail } from '../../features/reads/readSignal';
import type { NotificationService } from '../interfaces';
import type { Notification } from '../../types/domain';
import { requireSupabase } from './client';
async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const { data } = await requireSupabase().auth.getSession();
    const account = data.session?.user.id;
    if (!account)
        throw new Error('Sign in to see your Reads.');
    return mediaInteractionRequest<T>(path, init, true, account);
}
export const readSignalService: ReadSignalService = {
    list: period => accountRequest<ReachSummary[]>(`/api/reach/projects${period ? `?period=${period}` : ''}`),
    summary: (projectId, period) => accountRequest<ReachSummary>(`/api/reach/summary?project_id=${encodeURIComponent(projectId)}${period ? `&period=${period}` : ''}`),
    detail: (projectId, page, period) => accountRequest<ReadDetail>(`/api/reach/summary?project_id=${encodeURIComponent(projectId)}&page=${page}${period ? `&period=${period}` : ''}`),
    weekly: async (week) => { await accountRequest('/api/reach/weekly', { method: 'POST', body: JSON.stringify({ week }) }); },
};
export function withPageNotifications(existing: NotificationService): NotificationService {
    let snapshot: {
        account: string;
        entries: Notification[];
    } | null = null;
    return {
        async listNotifications() {
            const { data } = await requireSupabase().auth.getSession();
            const account = data.session?.user.id;
            if (!account) {
                snapshot = null;
                return [];
            }
            const [base, pages] = await Promise.allSettled([existing.listNotifications(), accountRequest<Notification[]>('/api/reach/notifications')]);
            if (base.status === 'rejected')
                throw base.reason;
            const entries = [...base.value, ...(pages.status === 'fulfilled' ? pages.value : [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            const { data: current } = await requireSupabase().auth.getSession();
            if (current.session?.user.id !== account)
                return [];
            snapshot = { account, entries };
            return entries;
        },
        async markRead(id) { if (!id.startsWith('d1:'))
            return existing.markRead(id); const { data } = await requireSupabase().auth.getSession(); if (!snapshot || snapshot.account !== data.session?.user.id)
            return; const entry = snapshot.entries.find(item => item.id === id); if (entry)
            await mediaInteractionRequest('/api/reach/read', { method: 'POST', body: JSON.stringify({ id, revision: entry.timestamp }) }, true, snapshot.account); },
        async markAllRead() { const { data } = await requireSupabase().auth.getSession(); if (!snapshot || snapshot.account !== data.session?.user.id)
            return; const account = snapshot.account; const current = snapshot.entries.filter(item => item.id.startsWith('d1:') && item.isUnread); await Promise.all([existing.markAllRead(), ...current.map(entry => mediaInteractionRequest('/api/reach/read', { method: 'POST', body: JSON.stringify({ id: entry.id, revision: entry.timestamp }) }, true, account))]); },
        // D1 does not have Supabase realtime: keep the existing visible30s poll alive.
        subscribeToNotifications(onChange, onStatus) { return existing.subscribeToNotifications(onChange, () => onStatus?.(false)); },
    };
}
