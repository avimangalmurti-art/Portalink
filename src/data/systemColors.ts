// Content card system colours. Values resolve from CSS variables so the
// palette shifts automatically between the light and dark themes.
export const systemColors = ['var(--apple-red)', 'var(--apple-orange)', 'var(--apple-yellow)', 'var(--apple-green)', 'var(--apple-mint)', 'var(--apple-teal)', 'var(--apple-cyan)', 'var(--apple-blue)', 'var(--apple-indigo)', 'var(--apple-purple)', 'var(--apple-pink)', 'var(--apple-brown)'];

// Stable per-item colour: the same card always gets the same colour, but the
// spread across a feed reads as random.
export function getSystemColor(seed: string): string {
  const characterTotal = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0) * 31, 0);
  return systemColors[characterTotal % systemColors.length];
}

// Position-aware variant: walks the palette so a screenful of cards shows the
// whole rainbow instead of clustering on a few hues.
export function getSystemColorAt(index: number, seed = ''): string {
  const seedOffset = Array.from(seed).reduce((total, character) => total + character.charCodeAt(0), 0);
  // Step by 5 (coprime with 12) so neighbouring cards land far apart in hue.
  return systemColors[(index * 5 + seedOffset % 3) % systemColors.length];
}