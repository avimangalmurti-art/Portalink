/**
 * The semantic token layer.
 *
 * The values themselves live in `index.css` as CSS custom properties, so light
 * and dark resolve through one system. This file is the typed index of what
 * exists, plus the non-colour scales (spacing, radii, control heights, motion,
 * icon sizes) the product already follows.
 *
 * Rules:
 *  - Components reference `token.surface.raised`, never a raw hex value.
 *  - Adding a colour means adding a semantic name here and a variable in
 *    index.css for both appearances — not a one-off hex in a component.
 */

const cssVar = (name: string) => `var(--${name})`;

/** Product-wide semantic colours. */
export const color = {
  background: {
    primary: cssVar('surface-canvas'),
    secondary: cssVar('surface-sunken')
  },
  surface: {
    default: cssVar('surface-raised'),
    raised: cssVar('surface-raised'),
    sunken: cssVar('surface-sunken'),
    inset: cssVar('surface-inset'),
    overlay: cssVar('surface-overlay'),
    hover: cssVar('surface-hover'),
    pressed: cssVar('surface-pressed'),
    selected: cssVar('surface-selected')
  },
  text: {
    primary: cssVar('text-primary'),
    secondary: cssVar('text-secondary'),
    tertiary: cssVar('text-tertiary'),
    disabled: cssVar('text-disabled'),
    inverse: cssVar('text-inverse')
  },
  border: {
    subtle: cssVar('hairline'),
    strong: cssVar('hairline-strong')
  },
  accent: {
    primary: cssVar('accent-color'),
    text: cssVar('accent-text'),
    foreground: cssVar('accent-foreground'),
    soft: cssVar('accent-soft')
  },
  semantic: {
    success: cssVar('status-success'),
    warning: cssVar('status-warning'),
    destructive: cssVar('status-danger'),
    informational: cssVar('status-info')
  },
  social: {
    unread: cssVar('social-unread'),
    presence: cssVar('social-presence'),
    verification: cssVar('social-verification')
  },
  intelligence: {
    accent: cssVar('intelligence-accent'),
    surface: cssVar('intelligence-surface'),
    processing: cssVar('intelligence-processing')
  },
  focusRing: cssVar('focus-ring')
} as const;

/**
 * Studio carries its own dark-first scale for the same roles, so the analytics
 * workspace can differ in tone without inventing new meanings.
 */
export const studioColor = {
  canvas: cssVar('studio-canvas'),
  panel: [cssVar('studio-panel-a'), cssVar('studio-panel-b'), cssVar('studio-panel-c')],
  elevated: cssVar('studio-elevated'),
  inset: cssVar('studio-inset'),
  pressed: cssVar('studio-pressed'),
  text: {
    primary: cssVar('studio-text'),
    secondary: cssVar('studio-text-muted'),
    tertiary: cssVar('studio-text-tertiary'),
    disabled: cssVar('studio-text-disabled')
  },
  border: {
    subtle: cssVar('studio-hairline'),
    strong: cssVar('studio-hairline-strong')
  },
  accent: cssVar('studio-accent'),
  accentSoft: cssVar('studio-accent-soft'),
  focusRing: cssVar('studio-focus-ring'),
  /** Semantic data meanings. One meaning, one colour, product-wide. */
  semantic: {
    interaction: cssVar('studio-accent'),
    attention: cssVar('studio-gaze'),
    ai: cssVar('studio-indigo'),
    success: cssVar('studio-success'),
    warning: cssVar('studio-warning'),
    pending: cssVar('studio-pending'),
    affinity: cssVar('studio-affinity'),
    audio: cssVar('studio-audio')
  }
} as const;

/** Content uses a 4px family; compact navigation pairs a 6px gap with an 8px inset. */
export const space = {
  '2xs': 4,
  navigationGap: 6,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48
} as const;

/** Effective shell roles. Fields, navigation, overlays and content have distinct shapes. */
export const radius = {
  control: 10,
  field: 8,
  controlLarge: 10,
  card: 18,
  inset: 13,
  panel: 12,
  dialog: 18,
  pill: 9999
} as const;

/** Control heights, so buttons, inputs, and selects line up. */
export const controlHeight = {
  xs: 28,
  sm: 32,
  md: 36,
  lg: 40,
  xl: 44
} as const;
export const iconSize = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20
} as const;

/** macOS system text roles. Their responsive values live in index.css. */
export const typography = {
  pageTitle: 'type-large-title font-semibold',
  sectionTitle: 'type-title-2 font-semibold',
  cardTitle: 'type-title-3 font-semibold',
  headline: 'type-headline',
  body: 'type-body',
  label: 'type-callout font-medium',
  eyebrow: 'type-caption-2 font-semibold uppercase tracking-[0.06em]',
  metadata: 'type-footnote'
} as const;

/** Elevation is broad and faint; separation comes from borders and tone. */
export const elevation = {
  none: 'none',
  menu: '0 10px 28px rgba(0,0,0,0.22)',
  overlay: '0 18px 48px rgba(0,0,0,0.34)'
} as const;

/** Geographic/content motion. Chrome uses --motion-fast/base/slow (120/180/260ms).
 * Both families are short, ease-out and suppressible; their roles differ. */
export const motion = {
  duration: {
    press: 140,
    control: 150,
    panel: 200,
    stage: 240
  },
  easing: {
    standard: 'cubic-bezier(0.23, 1, 0.32, 1)',
    out: 'ease-out'
  }
} as const;

/** Navigation geometry is distinct from smaller inline/editing controls. */
export const navigation = {
  control: 40,
  header: 64,
  glyph: 18,
  inset: 8,
  gap: 6,
  collapsedPanel: 52
} as const;
