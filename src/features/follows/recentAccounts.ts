import type { FeedCreator } from '../../types/domain';
const key = (account: string) => `portalink:recent-accounts:${account}`;
export function readRecentAccounts(account?: string): FeedCreator[] {
  if (!account) return [];
  try { const value: unknown = JSON.parse(localStorage.getItem(key(account)) ?? '[]');
    return Array.isArray(value) ? value.filter((p): p is FeedCreator => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.avatar === 'string' && typeof p.kind === 'string').slice(0, 30) : [];
  } catch { return []; }
}
export function rememberAccount(account: string | undefined, person: FeedCreator) {
  if (!account) return;
  try { localStorage.setItem(key(account), JSON.stringify([person, ...readRecentAccounts(account).filter(p => p.id !== person.id)].slice(0, 30))); } catch { /* Storage is optional; navigation remains available. */ }
}

export function forgetAccount(account: string | undefined, personId: string) {
  if (!account) return;
  try { localStorage.setItem(key(account), JSON.stringify(readRecentAccounts(account).filter(person => person.id !== personId))); } catch { /* Storage is optional. */ }
}
