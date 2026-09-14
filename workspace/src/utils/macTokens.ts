import type React from 'react';

/**
 * The accent-derived half of the macOS semantic token set.
 *
 * The appearance-dependent values — labels, window and content surfaces, fills,
 * separators, radii — are static per appearance and live in `index.css`, keyed
 * off the `.theme-*`, `.reduce-translucency`, and `.high-contrast` classes the
 * shell already applies. Only the tokens that depend on the CHOSEN accent have
 * to be resolved in JavaScript, so this is deliberately small: it is an
 * extension of the existing root token layer, not a second appearance system.
 *
 * Selection and focus are derived here rather than pinned to blue, so changing
 * the accent moves them with it.
 */
export function resolveMacTokens(accent: string, appearance: 'light' | 'dark'): React.CSSProperties {
  const tokens: Record<string, string> = {
    '--mac-accent': accent,
    /*
     * Selection is a wash of the accent, not the accent itself, so selected text
     * and rows stay readable. A dark appearance needs slightly more of it to read
     * at the same strength against a dark surface.
     */
    '--mac-selection-bg': `color-mix(in srgb, ${accent} ${appearance === 'dark' ? 28 : 20}%, transparent)`,
    // Focus uses the contrast-corrected companion resolved by the root accent
    // family, so light accents remain visible on a light canvas.
    '--mac-focus-ring': 'var(--focus-ring)'
  };
  return tokens as React.CSSProperties;
}
