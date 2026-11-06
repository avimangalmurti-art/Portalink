import { mediaInteractionRequest } from '../../features/media-interactions/mediaInteractionRequest';
import type { ReadSignalService, ReachSummary, ReadDetail } from '../../features/reads/readSignal';
import type { NotificationDeleteTarget, NotificationService } from '../interfaces';
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
    const changeListeners = new Set<() => void>();
    let snapshot: {
        account: string;
        entries: Notification[];
    } | null = null;
    return {
        async deleteNotifications(targets) {
            if (!targets.length) return [];
            const uuid = '[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}';
            const validId = new RegExp(`^(?:${uuid}|d1:(?:page:${uuid}|week:\\d{4}-\\d{2}-\\d{2}:${uuid}))$`, 'i');
            if (targets.length > 200 || targets.some(target => !target || typeof target.id !== 'string' || !validId.test(target.id)
                || typeof target.timestamp !== 'string' || !Number.isFinite(Date.parse(target.timestamp)))) throw new Error('Invalid notification selection.');
            const selected = [...new Map(targets.map(({ id, timestamp }) => [JSON.stringify([id, timestamp]), { id, timestamp }])).values()];
            const { data, error } = await requireSupabase().auth.getSession();
            const account = data.session?.user.id;
            if (error || !account) throw new Error('Sign in to manage notifications.');
            const base = selected.filter(target => !target.id.startsWith('d1:'));
            const pages = selected.filter(target => target.id.startsWith('d1:'));
            const writes: Array<Promise<NotificationDeleteTarget[]>> = [];
            if (base.length) writes.push(existing.deleteNotifications(base));
            for (let offset = 0; offset < pages.length; offset += 100) writes.push(mediaInteractionRequest<{ dismissed: Array<{ id: string; revision: string }> }>('/api/reach/dismiss', {
                method: 'POST', body: JSON.stringify({ notifications: pages.slice(offset, offset + 100).map(target => ({ id: target.id, revision: target.timestamp })) }),
            }, true, account).then(response => (response.dismissed ?? []).map(target => ({ id: target.id, timestamp: target.revision }))));
            const results = await Promise.allSettled(writes);
            const { data: current, error: currentError } = await requireSupabase().auth.getSession();
            if (currentError || current.session?.user.id !== account) return [];
            const confirmed = new Set(results.flatMap(result => result.status === 'fulfilled' ? result.value.map(target => JSON.stringify([target.id, target.timestamp])) : []));
            const removed = selected.filter(target => confirmed.has(JSON.stringify([target.id, target.timestamp])));
            if (!removed.length && results.every(result => result.status === 'rejected')) throw new Error('Notifications could not be deleted. Please try again.');
            if (snapshot?.account === account) snapshot.entries = snapshot.entries.filter(entry => !confirmed.has(JSON.stringify([entry.id, entry.timestamp])));
            if (removed.length) changeListeners.forEach(listener => { try { listener(); } catch { /* A subscriber cannot undo confirmed deletion. */ } });
            return removed;
        },
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
        subscribeToNotifications(onChange, onStatus) {
            changeListeners.add(onChange);
            const unsubscribe = existing.subscribeToNotifications(onChange, () => onStatus?.(false));
            return () => { changeListeners.delete(onChange); unsubscribe(); };
        },
    };
}
