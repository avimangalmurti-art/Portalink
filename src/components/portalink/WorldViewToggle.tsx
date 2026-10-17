import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

/** World returns to the working Home entry in both presentations. */
export function WorldViewToggle({ onToggle }: { onToggle: () => void }) {
  /*
   * On WEB, icon only: the destination's name still reaches assistive tech through the
   * label and a sighted viewer through the tooltip, so nothing is lost by dropping
   * the visible text. With no surface behind it, colour is what has to carry the
   * affordance — it takes the accent on hover and on keyboard focus, never colour
   * alone as the only signal since the ring accompanies focus.
   *
   * `data-keep-color` on both the button and the glyph opts them out of the dark
   * theme's blanket "every icon is text-primary" rule, which would otherwise
   * repaint the accent straight back to white.
   */
  return <button type="button" onClick={onToggle} aria-label="Back to Home" title="Back to Home" data-keep-color="" className="world-view-back side-panel-compact-control shape-compact inline-flex shrink-0 items-center justify-center text-[var(--portalink-text-primary)] transition-colors duration-[var(--m-fast)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--portalink-focus-ring)] motion-reduce:transition-none">
      <InterfaceIcon icon={ArrowLeftIcon} size="lg" weight="medium" keepColor mirroredInRtl />
    </button>;
}
