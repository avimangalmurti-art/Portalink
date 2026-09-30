/** Existing handles remain stable; new profiles don't need to choose one. */
export function createProfileHandle(name: string): string {
  const prefix = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 7) || 'profile';
  return `${prefix}.${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
