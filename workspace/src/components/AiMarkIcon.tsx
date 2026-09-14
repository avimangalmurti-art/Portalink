import React from 'react';
type AiMarkIconProps = React.SVGProps<SVGSVGElement>;

/**
 * Product mark used for every AI surface (Palo, Personalization).
 * A pencil enclosed by an open ring, drawn in currentColor so it inherits
 * the surrounding text colour in both themes.
 */
export function AiMarkIcon({
  className = '',
  ...props
}: AiMarkIconProps) {
  return <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
      {/* The broken circle leaves breathing room for the pencil and remains
          recognizable at the 16px navigation size. */}
      <path d="M15.8 3.6A8.5 8.5 0 1 0 20.4 8" />
      <path d="m13.7 5.2 5.1 5.1-8.3 8.3-3.2.7.7-3.2 8.3-8.3Z" />
      <path d="m14.8 6.3 2.9 2.9" />
    </svg>;
}
