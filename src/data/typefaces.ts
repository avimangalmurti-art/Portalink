export type TypefaceCategory = 'Sans Serif' | 'Serif' | 'Artistic' | 'Calligraphy';
export type Typeface = {
  id: string;
  name: string;
  category: TypefaceCategory;
  stack: string;
};

// Web-safe families only, so every viewer sees the face they pick.
export const typefaces: Typeface[] = [{
  id: 'default',
  name: 'Portalink',
  category: 'Sans Serif',
  stack: "Inter, ui-sans-serif, system-ui, sans-serif"
}, {
  id: 'system',
  name: 'System font',
  category: 'Sans Serif',
  stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
}, {
  id: 'helvetica',
  name: 'Helvetica Neue',
  category: 'Sans Serif',
  stack: "'Helvetica Neue', Helvetica, Arial, sans-serif"
}, {
  id: 'verdana',
  name: 'Verdana',
  category: 'Sans Serif',
  stack: "Verdana, Geneva, sans-serif"
}, {
  id: 'trebuchet',
  name: 'Trebuchet MS',
  category: 'Sans Serif',
  stack: "'Trebuchet MS', 'Lucida Grande', sans-serif"
}, {
  id: 'futura',
  name: 'Futura',
  category: 'Sans Serif',
  stack: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif"
}, {
  id: 'georgia',
  name: 'Georgia',
  category: 'Serif',
  stack: "Georgia, 'Times New Roman', serif"
}, {
  id: 'times',
  name: 'Times New Roman',
  category: 'Serif',
  stack: "'Times New Roman', Times, serif"
}, {
  id: 'palatino',
  name: 'Palatino',
  category: 'Serif',
  stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif"
}, {
  id: 'baskerville',
  name: 'Baskerville',
  category: 'Serif',
  stack: "Baskerville, 'Libre Baskerville', Georgia, serif"
}, {
  id: 'courier',
  name: 'Courier New',
  category: 'Artistic',
  stack: "'Courier New', Courier, monospace"
}, {
  id: 'menlo',
  name: 'Menlo',
  category: 'Artistic',
  stack: "Menlo, Consolas, 'Liberation Mono', monospace"
}, {
  id: 'impact',
  name: 'Impact',
  category: 'Artistic',
  stack: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif"
}, {
  id: 'copperplate',
  name: 'Copperplate',
  category: 'Artistic',
  stack: "Copperplate, 'Copperplate Gothic Light', 'Papyrus', fantasy"
}, {
  id: 'brush-script',
  name: 'Brush Script',
  category: 'Calligraphy',
  stack: "'Brush Script MT', 'Brush Script Std', cursive"
}, {
  id: 'snell',
  name: 'Snell Roundhand',
  category: 'Calligraphy',
  stack: "'Snell Roundhand', 'Apple Chancery', cursive"
}, {
  id: 'chancery',
  name: 'Apple Chancery',
  category: 'Calligraphy',
  stack: "'Apple Chancery', 'URW Chancery L', cursive"
}];
export const typefaceCategories: TypefaceCategory[] = ['Sans Serif', 'Serif', 'Artistic', 'Calligraphy'];

/**
 * Japanese, Devanagari, and Siddham coverage, appended to whichever face is
 * chosen. None of the faces above carry those scripts, and font fallback runs
 * glyph by glyph — so without this a title mixing scripts renders its Latin in
 * the chosen face and everything else in a last-resort font.
 */
export const scriptFallbackStack = "'Noto Sans', 'Noto Sans JP', 'Noto Sans Devanagari', 'Noto Sans Siddham'";

/**
 * The chosen face first, then the multi-script fallbacks, then the generic.
 * The generic must stay last: it always matches, so any family after it is
 * never reached.
 */
export function getTypefaceStack(id: string): string {
  const {
    stack
  } = typefaces.find((typeface) => typeface.id === id) ?? typefaces[0];
  return `${stack}, ${scriptFallbackStack}`;
}

/**
 * There is deliberately no profile-level face. Typography belongs to an
 * individual project (see `data/projectTypefaces.ts`); every page around the
 * work — headings, navigation, controls, metadata — renders in the interface
 * face, identically on every profile.
 */