import { validHandle } from '../features/sharing/shareModel';
/** Preserve the full available name; generate a suffix only after a real collision. */
export function createProfileHandle(name: string, collision = false): string {
  const prefix = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 30) || 'creator';
  const base = prefix.length < 3 ? `${prefix}creator` : prefix;
  return collision ? `${base.slice(0,17)}.${crypto.randomUUID().replace(/-/g, '').slice(0,12)}` : base;
}

/** Availability is advisory; the database unique constraint still owns races. */
export async function prepareProfileHandle(requested: string, check: (handle: string) => Promise<'available' | 'taken' | 'unavailable'>): Promise<string> {
  if (!validHandle(requested)) throw new Error('Use 3–30 lowercase letters, numbers or dots. Reserved addresses cannot be used.');
  let candidate = requested;
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await check(candidate);
    if (result === 'available') return candidate;
    if (result !== 'taken') throw new Error('Could not check your handle. Try again before creating your account.');
    candidate = createProfileHandle(requested, true);
  }
  throw new Error('Could not find an available handle. Choose another.');
}
