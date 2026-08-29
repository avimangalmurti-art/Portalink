import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

/** The Satellite surface has one conventional way back to Search. */
export function WorldViewToggle({ onToggle }: { onToggle: () => void }) {
  /*
   * Icon only: the destination's name still reaches assistive tech through the
   * label and a sighted viewer through the tooltip, so nothing is lost by dropping
   * the visible text. With no surface behind it, colour is what has to carry the
   * affordance — it takes the accent on hover and on keyboard focus, never colour
   * alone as the only signal since the ring accompanies focus.
   *
   * `data-keep-color` on both the button and the glyph opts them out of the dark
   * theme's blanket "every icon is text-primary" rule, which would otherwise
   * repaint the accent straight back to white.
   *
   * The negative leading margin cancels the 32px target's own inset so the GLYPH,
   * not the invisible box around it, starts on the page gutter — which is what
   * closes the gap to the field beside it while keeping a full-size press target.
   */
  return <button type="button" onClick={onToggle} aria-label="Back to Search" title="Back" data-keep-color="" /* Leading control, so the negative inset cancels the target's padding on its
  LEFT edge — the glyph itself lands on the page gutter. */ className="-ml-[7px] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--portalink-text-primary)] transition-colors duration-150 hover:text-[var(--accent-text)] focus:outline-none focus-visible:text-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--portalink-focus-ring)] motion-reduce:transition-none" style={{ alignItems: "center", justifyContent: "flex-end" }}>
      <InterfaceIcon icon={ArrowLeftIcon} size="lg" weight="medium" keepColor mirroredInRtl />
    </button>;
}
