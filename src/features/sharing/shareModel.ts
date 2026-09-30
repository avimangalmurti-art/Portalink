/** Public address grammar is shared by client, router and worker. */
export const RESERVED_HANDLES = new Set('share p studio messages settings search portalink api media feed discover profile item portals insights appearance saved notifications assets icons startup c collaboration activity edit home index.html share.html favicon.ico og.png image.png image-dark.png site.webmanifest robots.txt sitemap.xml manifest.json sw.js portalink-welcome-loop.webp portalink-splash-mobile.mp4'.split(' '));
export function normalizePublicHandle(value: string): string { return value.trim().replace(/^@/, '').toLowerCase(); }
export function validHandle(value: string): boolean { return /^[a-z0-9][a-z0-9.]{2,29}$/.test(value) && !RESERVED_HANDLES.has(value); }
export function handleFromPath(path: string): string | null {
  const match = /^\/([^/]+)\/?$/.exec(path);
  return match && validHandle(match[1].toLowerCase()) ? match[1].toLowerCase() : null;
}
export function isPublicSharePath(path: string): boolean { return /^\/share(?:\/|$)/i.test(path) || Boolean(handleFromPath(path)); }
export function handleSuggestions(name: string): string[] {
  const parts = name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || 'creator').slice(0, 20), full = parts.join('.').slice(0, 25);
  return [...new Set([first, full, `${first}.work`, `${first}.portfolio`, `${first}.studio`].filter(validHandle))].slice(0, 3);
}
export type ShareAddress = { handle: string | null; available: boolean; confirmed: boolean };
export type HandleResolution = { profileId: string; handle: string; alias: boolean };
export function parseResolution(value: unknown): HandleResolution | null {
  const row = value as Partial<HandleResolution> | null;
  return row && typeof row.profileId === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(row.profileId) && typeof row.handle === 'string' && validHandle(row.handle) && typeof row.alias === 'boolean'
    ? { profileId: row.profileId, handle: row.handle, alias: row.alias } : null;
}
export function portfolioPath(id: string, handle?: string | null): string { return handle && validHandle(handle) ? `/${handle}` : `/share/${encodeURIComponent(id)}`; }
export function shareCardText(name: string, headline: string | undefined, count: number, school?: string) {
  return { title: `${name.trim()} — Portfolio`, description: [headline?.trim(), school?.trim(), `${count} ${count === 1 ? 'project' : 'projects'}`].filter(Boolean).join(' · ').slice(0, 160) };
}
export type PortfolioCard = { title: string; description: string; image: string | null; width?: number; height?: number; url: string };
export type Audience = 'professor' | 'employer' | 'friend';
export function audienceNote(audience: Audience, name: string): string {
  return { professor: `Hello, I’m ${name}. I’d love your feedback on my portfolio.`, employer: `Hello, I’m ${name}. Here is a selection of my work. I’d love to discuss opportunities to work together.`, friend: `Hi! I’ve put my work together in a portfolio. Have a look — I’d love to know what you think.` }[audience];
}
export function withReferral(url: string, id: string): string { const result = new URL(url); if (/^[a-z0-9]{1,16}$/i.test(id)) result.searchParams.set('via', id); return result.href; }
export function portfolioMailto(to: string, note: string, name: string, url: string): string {
  if (to && !/^[^\s@,;?&:#]+@[^\s@,;?&:#]+\.[^\s@,;?&:#]+$/.test(to)) throw new Error('Enter one complete email address.');
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Portfolio — ${name}`)}&body=${encodeURIComponent(`${note.trim()}\n\n${url}`.trim())}`;
}
