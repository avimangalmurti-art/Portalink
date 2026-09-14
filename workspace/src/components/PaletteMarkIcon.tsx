import React from 'react';

/**
 * The Studio mark: a painter's palette whose four wells carry actual paint.
 *
 * The palette body strokes in `currentColor`, so it still inherits whatever the
 * surrounding navigation sets — the sidebar's white, a light theme's near-black.
 * Only the four wells hold fixed colour, written as explicit `fill` values rather
 * than `currentColor`, which is what lets them survive the sidebar's blanket icon
 * colour rule without opting the whole mark out of it.
 */
export function PaletteMarkIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false" {...props}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.926.746-1.688 1.688-1.688h1.828c2.5 0 4.735-2.234 4.735-4.734C21 6.109 17.109 2 12 2z" />
      {/* Paint, not chrome: each well keeps its own colour in every theme. */}
      <circle cx="6.5" cy="12.5" r="1.3" fill="#0a84ff" stroke="none" />
      <circle cx="8.5" cy="7.5" r="1.3" fill="#ff453a" stroke="none" />
      <circle cx="13.5" cy="6.5" r="1.3" fill="#ffd60a" stroke="none" />
      <circle cx="17.5" cy="10.5" r="1.3" fill="#30d158" stroke="none" />
    </svg>;
}
