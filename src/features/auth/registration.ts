import type { AuthService, ProfileService } from '../../services/interfaces';
import type { AuthSession } from '../../types/auth';
import type { CreateProfileInput, PreparedAvatar } from '../../types/profile';
import { validateLocation, validateProfileName } from '../profile/validation';

/** User-entered setup data only. Never an ownership or verification claim. */
export type RegistrationProfile = {
  version: 1;
  id: string;
  name: string;
  location: string;
  accentColor: string;
  hasAvatar: boolean;
};

export function readRegistrationProfile(value: unknown): RegistrationProfile | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)
    || typeof data.name !== 'string' || validateProfileName(data.name)
    || typeof data.location !== 'string' || validateLocation(data.location)
    || typeof data.accentColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(data.accentColor)
    || typeof data.hasAvatar !== 'boolean') return;
  return { version: 1, id: data.id, name: data.name.trim(), location: data.location.trim(), accentColor: data.accentColor, hasAvatar: data.hasAvatar };
}

export function canResumeRegistration(session: AuthSession | null, view: string | null): boolean {
  return Boolean(session?.user.isEmailVerified && !session.user.profileId && session.user.registration
    && !session.isPasswordRecovery && view !== 'resetPassword' && view !== 'forgotPassword');
}

/** Reconcile before creating, including an uncertain insert or a concurrent tab. */
export async function createOrResumeProfile(services: { auth: AuthService; profiles: ProfileService }, accountId: string, input: CreateProfileInput) {
  const assertAccount = async () => {
    const current = await services.auth.getSession();
    if (current?.user.id !== accountId || !current.user.isEmailVerified || current.isPasswordRecovery) {
      throw new Error('Sign in to this account to finish setup.');
    }
  };
  await assertAccount();
  let profile = await services.profiles.getProfileForAccount(accountId);
  let avatarPersisted = Boolean(input.avatar && profile?.avatar);
  if (!profile) {
    try {
      const result = await services.profiles.createProfile(accountId, input);
      profile = result.profile;
      avatarPersisted = result.avatarPersisted;
    } catch (error) {
      await assertAccount();
      profile = await services.profiles.getProfileForAccount(accountId);
      if (!profile) throw error;
      avatarPersisted = Boolean(input.avatar && profile.avatar);
    }
  }
  await assertAccount();
  return { profile, avatarPersisted };
}

type AvatarDraft = { id: string; expiresAt: number; file: File; originalSource?: File; crop?: PreparedAvatar['crop'] };
const DRAFT_LIFETIME = 7 * 24 * 60 * 60 * 1000;

function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('portalink-registration', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('avatars', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other setup tabs and try again.'));
  });
}

/** Only local image bytes are retained here. Passwords, tokens and email are absent. */
export async function saveRegistrationAvatar(id: string, avatar: PreparedAvatar | null): Promise<void> {
  if (!avatar) { await removeRegistrationAvatar(id); return; }
  const database = await openDrafts();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('avatars', 'readwrite');
      const store = tx.objectStore('avatars');
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if ((entry.value as AvatarDraft).expiresAt < Date.now()) entry.delete();
        entry.continue();
      };
      store.put({ id, expiresAt: Date.now() + DRAFT_LIFETIME, file: avatar.file,
        originalSource: avatar.originalSource instanceof File ? avatar.originalSource : undefined, crop: avatar.crop } satisfies AvatarDraft);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { database.close(); }
}

export async function readRegistrationAvatar(id: string): Promise<AvatarDraft | null> {
  const database = await openDrafts();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('avatars').objectStore('avatars').get(id);
      request.onsuccess = () => {
        const draft = request.result as AvatarDraft | undefined;
        resolve(draft && draft.expiresAt > Date.now() && draft.file instanceof Blob ? draft : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function removeRegistrationAvatar(id: string): Promise<void> {
  // Cleanup failure must never turn completed registration into a signup retry.
  try {
    const database = await openDrafts();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('avatars', 'readwrite');
        tx.objectStore('avatars').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { database.close(); }
  } catch { /* Expired drafts are pruned when this store next accepts an image. */ }
}
