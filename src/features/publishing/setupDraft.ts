export type SetupDraft = { title: string; summary: string; portal: string; name: string };

type StoredSetupDraft = SetupDraft & { version: 1 };
const PREFIX = 'portalink.project-setup.v1:';
const keyFor = (accountId: string, profileId: string) => {
  if (!accountId || !profileId) throw new Error('Sign in to save these project details.');
  return `${PREFIX}${encodeURIComponent(accountId)}:${encodeURIComponent(profileId)}`;
};

function storage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch { /* Explain unavailable storage without exposing browser error details. */ }
  throw new Error('Project details could not be saved on this device. Keep this screen open and try again.');
}

export function readSetupDraft(accountId: string, profileId: string): SetupDraft | null {
  const raw = storage().getItem(keyFor(accountId, profileId));
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Saved project details could not be opened. Keep this screen open and try again.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved project details could not be opened.');
  const draft = value as Partial<StoredSetupDraft>;
  if (draft.version !== 1 || typeof draft.title !== 'string' || typeof draft.summary !== 'string'
    || typeof draft.portal !== 'string' || !draft.portal || typeof draft.name !== 'string') {
    throw new Error('Saved project details could not be opened.');
  }
  return { title: draft.title, summary: draft.summary, portal: draft.portal, name: draft.name };
}

export function saveSetupDraft(accountId: string, profileId: string, draft: SetupDraft): void {
  try { storage().setItem(keyFor(accountId, profileId), JSON.stringify({ ...draft, version: 1 } satisfies StoredSetupDraft)); }
  catch { throw new Error('Project details could not be saved on this device. Keep this screen open and try again.'); }
}

/** Called only after the upload flow has durably checkpointed these details. */
export function clearSetupDraft(accountId: string, profileId: string): void {
  try { storage().removeItem(keyFor(accountId, profileId)); }
  catch { throw new Error('Saved project details could not be cleared. Your details are still here. Try again.'); }
}
