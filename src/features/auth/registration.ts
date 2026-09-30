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
  /** Omitted by older drafts, which retain the existing public default. */
  isPrivate?: boolean;
  accentColor: string;
  systemGray?: string;
  hasAvatar: boolean;
  /** Optional public destination to resume after email confirmation and setup. */
  returnPath?: string;
};

/** Navigation only: accept local public routes and explicitly safe viewer state. */
export function readSharedReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!/^\/share\/[a-z0-9_-]{1,128}(?:\/collaboration|\/c\/[a-z0-9_-]{1,128}(?:\/[a-z0-9_-]{1,128})?)?\/?$/i.test(pathname)) return;
  const url = new URL(value, 'https://portalink.invalid');
  const safe = new URL(url.pathname.replace(/\/$/, ''), url.origin);
  const view = url.searchParams.get('view');
  const page = url.searchParams.get('page');
  const media = url.searchParams.get('media');
  if (view === 'projects' || view === 'portals') safe.searchParams.set('view', view);
  if (page && /^[1-9]\d{0,4}$/.test(page)) safe.searchParams.set('page', page);
  if (media && /^[a-z0-9_-]{1,128}$/i.test(media)) safe.searchParams.set('media', media);
  return safe.pathname + safe.search;
}

export function readRegistrationProfile(value: unknown): RegistrationProfile | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)
    || typeof data.name !== 'string' || validateProfileName(data.name)
    || typeof data.location !== 'string' || validateLocation(data.location)
    || typeof data.accentColor !== 'string' || !/^#[a-f0-9]{6}$/i.test(data.accentColor)
    || typeof data.hasAvatar !== 'boolean'
    || (data.isPrivate !== undefined && typeof data.isPrivate !== 'boolean')) return;
  const returnPath = readSharedReturnPath(data.returnPath);
  const systemGray = typeof data.systemGray === 'string' && /^gray(?:[2-6])?$/.test(data.systemGray) ? data.systemGray : undefined;
  return { version: 1, id: data.id, name: data.name.trim(), location: data.location.trim(), isPrivate: data.isPrivate === true, accentColor: data.accentColor, ...(systemGray ? { systemGray } : {}), hasAvatar: data.hasAvatar, ...(returnPath ? { returnPath } : {}) };
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
export type PendingRegistration = {
  registration: RegistrationProfile;
  email: string;
  requiresEmailVerification: boolean;
  expiresAt: number;
  avatar: AvatarDraft | null;
};
type StoredRegistration = Omit<PendingRegistration, 'avatar'> & { id: string; savedAt: number };
const DRAFT_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('portalink-registration', 2);
    request.onupgradeneeded = () => {
      for (const name of ['avatars', 'drafts']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (blocked) database.close();
      else resolve(database);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other setup tabs and try again.')); };
  });
}

/** Resolve only after commit: a successful request alone does not mean bytes were saved. */
async function draftTransaction<T>(stores: string[], mode: IDBTransactionMode, enqueue: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const database = await openDrafts();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction(stores, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Your registration draft could not be saved.'));
      try { enqueue(tx, result => { value = result; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  } finally { database.close(); }
}

function pruneDrafts(tx: IDBTransaction, stores: string[], now: number) {
  for (const name of stores) {
    const cursor = tx.objectStore(name).openCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      if (!Number.isFinite(entry.value?.expiresAt) || entry.value.expiresAt <= now) entry.delete();
      entry.continue();
    };
  }
}

function normalizedEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : undefined;
}

function readCrop(value: unknown): PreparedAvatar['crop'] {
  if (!value || typeof value !== 'object') return;
  const crop = value as Record<string, unknown>;
  const { x, y, width, height, zoom } = crop;
  if ([x, y, width, height, zoom].every(number => typeof number === 'number' && Number.isFinite(number))) {
    return { x, y, width, height, zoom } as PreparedAvatar['crop'];
  }
}

function savedAvatar(id: string, expiresAt: number, input: PreparedAvatar): AvatarDraft {
  if (!(input.file instanceof File) || !AVATAR_TYPES.includes(input.file.type) || input.file.size === 0 || input.file.size > 4 * 1024 * 1024) {
    throw new Error('Choose a valid profile image before continuing.');
  }
  return { id, expiresAt, file: input.file,
    ...(input.originalSource instanceof File ? { originalSource: input.originalSource } : {}),
    ...(readCrop(input.crop) ? { crop: readCrop(input.crop) } : {}) };
}

function readSavedAvatar(value: unknown, id: string, now: number): AvatarDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Record<string, unknown>;
  if (draft.id !== id || typeof draft.expiresAt !== 'number' || !Number.isFinite(draft.expiresAt) || draft.expiresAt <= now || !(draft.file instanceof Blob)) return null;
  // Older browser storage implementations can restore a File as a Blob.
  const file = draft.file instanceof File ? draft.file : new File([draft.file], 'profile-image', { type: draft.file.type });
  try { return savedAvatar(id, draft.expiresAt, { file, fileName: file.name, sizeBytes: file.size, previewUrl: '', isPersisted: false,
    originalSource: draft.originalSource instanceof File ? draft.originalSource : undefined, crop: readCrop(draft.crop) }); }
  catch { return null; }
}

function readStoredRegistration(value: unknown): StoredRegistration | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as StoredRegistration;
  const registration = readRegistrationProfile(draft.registration);
  const email = normalizedEmail(draft.email);
  if (!registration || draft.id !== registration.id || !email || !Number.isFinite(draft.expiresAt)
    || !Number.isFinite(draft.savedAt) || typeof draft.requiresEmailVerification !== 'boolean') return null;
  return { id: registration.id, registration, email, expiresAt: draft.expiresAt, savedAt: draft.savedAt, requiresEmailVerification: draft.requiresEmailVerification };
}

/** Profile/email and File bytes commit together; passwords and preview URLs never enter storage. */
export async function saveRegistrationDraft(registration: RegistrationProfile, email: string, avatar: PreparedAvatar | null): Promise<void> {
  const profile = readRegistrationProfile(registration);
  const address = normalizedEmail(email);
  if (!profile || !address) throw new Error('Check your profile details and email before continuing.');
  if (profile.hasAvatar !== Boolean(avatar)) throw new Error('Choose your profile image again before continuing.');
  const now = Date.now();
  const expiresAt = now + DRAFT_LIFETIME;
  const image = avatar ? savedAvatar(profile.id, expiresAt, avatar) : null;
  await draftTransaction<void>(['drafts', 'avatars'], 'readwrite', tx => {
    pruneDrafts(tx, ['drafts', 'avatars'], now);
    const drafts = tx.objectStore('drafts');
    const existing = drafts.getAll();
    existing.onsuccess = () => {
      // Transactions serialize writers, including tabs saving during the same millisecond.
      const savedAt = (existing.result as unknown[]).reduce<number>((latest, value) => {
        const draft = readStoredRegistration(value);
        return draft ? Math.max(latest, draft.savedAt + 1) : latest;
      }, now);
      drafts.put({ id: profile.id, registration: profile, email: address, expiresAt, savedAt, requiresEmailVerification: false } satisfies StoredRegistration);
      const avatars = tx.objectStore('avatars');
      if (image) avatars.put(image);
      else avatars.delete(profile.id);
    };
  });
}

/** Filters are conjunctive. With neither filter, restore the most recently saved draft. */
export async function readRegistrationDraft(email?: string, id?: string): Promise<PendingRegistration | null> {
  const address = email === undefined ? undefined : normalizedEmail(email);
  if (email !== undefined && !address) return null;
  const now = Date.now();
  return draftTransaction<PendingRegistration | null>(['drafts', 'avatars'], 'readwrite', (tx, result) => {
    pruneDrafts(tx, ['drafts', 'avatars'], now);
    const request = tx.objectStore('drafts').getAll();
    request.onsuccess = () => {
      const latest = (request.result as unknown[]).map(readStoredRegistration)
        .filter((draft): draft is StoredRegistration => Boolean(draft && draft.expiresAt > now && (!address || draft.email === address) && (id === undefined || draft.id === id)))
        .sort((a, b) => b.savedAt - a.savedAt)[0];
      if (!latest) { result(null); return; }
      const { registration, email: storedEmail, requiresEmailVerification, expiresAt } = latest;
      const pending: PendingRegistration = { registration, email: storedEmail, requiresEmailVerification, expiresAt, avatar: null };
      if (!registration.hasAvatar) { result(pending); return; }
      const image = tx.objectStore('avatars').get(registration.id);
      image.onsuccess = () => result({ ...pending, avatar: readSavedAvatar(image.result, registration.id, now) });
    };
  });
}

/** Delivery status is separate from the draft; it does not extend retention or alter fields. */
export async function markRegistrationVerification(id: string): Promise<void> {
  const now = Date.now();
  await draftTransaction<void>(['drafts', 'avatars'], 'readwrite', tx => {
    pruneDrafts(tx, ['drafts', 'avatars'], now);
    const drafts = tx.objectStore('drafts');
    const request = drafts.get(id);
    request.onsuccess = () => {
      const draft = readStoredRegistration(request.result);
      if (draft && draft.expiresAt > now) drafts.put({ ...draft, requiresEmailVerification: true });
    };
  });
}

/** Existing image-only drafts remain readable after the v1 database upgrade. */
export async function saveRegistrationAvatar(id: string, avatar: PreparedAvatar | null): Promise<void> {
  if (!avatar) { await removeRegistrationAvatar(id); return; }
  const now = Date.now();
  const image = savedAvatar(id, now + DRAFT_LIFETIME, avatar);
  await draftTransaction<void>(['avatars'], 'readwrite', tx => {
    pruneDrafts(tx, ['avatars'], now);
    tx.objectStore('avatars').put(image);
  });
}

export async function readRegistrationAvatar(id: string): Promise<AvatarDraft | null> {
  const now = Date.now();
  return draftTransaction<AvatarDraft | null>(['avatars'], 'readwrite', (tx, result) => {
    pruneDrafts(tx, ['avatars'], now);
    const request = tx.objectStore('avatars').get(id);
    request.onsuccess = () => result(readSavedAvatar(request.result, id, now));
  });
}

export async function removeRegistrationAvatar(id: string): Promise<void> {
  try {
    await draftTransaction<void>(['avatars'], 'readwrite', tx => { tx.objectStore('avatars').delete(id); });
  } catch { /* Cache cleanup must not turn completed registration into a signup retry. */ }
}

/** Called only after confirmed completion; each cleanup targets one registration id. */
export async function removeRegistrationDraft(id: string): Promise<void> {
  try {
    await draftTransaction<void>(['drafts', 'avatars'], 'readwrite', tx => {
      tx.objectStore('drafts').delete(id);
      tx.objectStore('avatars').delete(id);
    });
  } catch { /* Expired records will be pruned by the next successful draft transaction. */ }
}
