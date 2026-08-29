import React from 'react';
type PortalRingIconProps = React.SVGProps<SVGSVGElement>;

// A portal seen at a slight angle: tilted outer ellipse, clean inner ring,
// and a live green dot at its centre. Strokes inherit currentColor so the
// icon follows the sidebar's default and selected states.
export function PortalRingIcon(props: PortalRingIconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <ellipse cx="12" cy="12" rx="10" ry="6" opacity="0.4" transform="rotate(-20 12 12)" />
      <circle cx="12" cy="12" r="5.5" />
      <circle className="portal-ring-dot" cx="12" cy="12" r="2" fill="var(--social-presence)" stroke="none" />
    </svg>;
}
