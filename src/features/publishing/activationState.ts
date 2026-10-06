import type { PublishResult } from '../../types/publishing';
export type ActivationProgress = {
  profileId: string;
  stage: 'start' | 'portal' | 'project' | 'live';
  name: string;
  icon: string;
  portal?: { id: string; label: string; iconName: string };
  result?: PublishResult;
};
const key = (accountId: string) => `portalink:activation:v1:${accountId}`;
export function readActivation(accountId: string): ActivationProgress | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(accountId)) ?? 'null');
    return value && typeof value.profileId === 'string' && typeof value.name === 'string' && typeof value.icon === 'string'
      && ['start', 'portal', 'project', 'live'].includes(value.stage)
      && (!value.portal || (typeof value.portal.id === 'string' && typeof value.portal.label === 'string' && typeof value.portal.iconName === 'string'))
      && (value.stage !== 'project' || value.portal)
      && (value.stage !== 'live' || (value.result && typeof value.result.projectId === 'string'))
      ? value : null;
  } catch { return null; }
}
export function writeActivation(accountId: string, progress: ActivationProgress): void {
  try { localStorage.setItem(key(accountId), JSON.stringify(progress)); } catch { /* Keep the in-memory flow usable when device storage is unavailable. */ }
}
export function beginActivation(accountId: string, profileId: string) {
  const progress: ActivationProgress = { profileId, stage: 'portal', name: '', icon: 'lucide:briefcase-business' };
  writeActivation(accountId, progress);
  return progress;
}
export function finishActivation(accountId: string): void {
  try { localStorage.removeItem(key(accountId)); } catch { /* A confirmed server project still prevents a new first-project request. */ }
}
