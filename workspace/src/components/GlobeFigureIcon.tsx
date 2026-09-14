import React from 'react';

/**
 * The messages mark: a rounded speech bubble with a tail at the lower left and
 * three dots inside.
 *
 * Drawn as vectors rather than placed as a bitmap: the mark has to sit on the
 * night sky AND on the light theme, stay crisp at any size, and take its colour
 * from whatever control carries it. The outline strokes in `currentColor` and
 * the dots are filled in the same colour, so the whole mark inherits the
 * control's state without a second colour to keep in sync.
 */
export function GlobeFigureIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {/* One continuous outline: the bubble's ellipse, then the tail folding out
         of its lower-left edge and back into it, so the shape reads as a single
         drawn form rather than a balloon with a triangle stuck on. */}
      <path d="M24 5c10.5 0 19 7.4 19 16.5S34.5 38 24 38c-2.6 0-5-.3-7.3-1-2.6 2.6-6 4.2-9.7 4.4 1.8-1.9 2.9-4.3 3-6.9C5.5 31.5 5 26.8 5 21.5C5 12.4 13.5 5 24 5Z" />
      {/* Three dots, evenly spaced on the bubble's own centre line. */}
      <circle cx="15" cy="21" r="3.1" fill="currentColor" stroke="none" />
      <circle cx="24" cy="21" r="3.1" fill="currentColor" stroke="none" />
      <circle cx="33" cy="21" r="3.1" fill="currentColor" stroke="none" />
    </svg>;
}
