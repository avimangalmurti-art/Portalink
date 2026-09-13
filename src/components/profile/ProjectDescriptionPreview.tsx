import React, { useEffect, useRef, useState, type ComponentPropsWithRef, type ReactElement } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLongPressPreview } from '../../hooks/useLongPressPreview';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { ModalPortal } from '../ui/ModalPortal';

/** Enlarge a sidebar row into a reading surface without selecting its project. */
export function ProjectDescriptionPreview({ enabled, project, selectionScope, typefaceStack, children }: {
  enabled: boolean;
  project: { id: string; title: string; summary?: string };
  selectionScope?: string | null;
  typefaceStack?: string;
  children: ReactElement<ComponentPropsWithRef<'button'>>;
}) {
  const presentation = usePresentation();
  const isEnabled = enabled && presentation === 'mobile';
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const events = useLongPressPreview(isEnabled, `${project.id}:${selectionScope ?? ''}`, () => { triggerRef.current?.focus({ preventScroll: true }); setOpen(true); }, children.props.onClick);
  const close = () => setOpen(false);
  useModalFocus(open && isEnabled, dialogRef, close);
  useEffect(() => { setOpen(false); }, [isEnabled, project.id, selectionScope]);
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <>
    {isEnabled ? React.cloneElement(children, { ...events, ref: triggerRef, 'aria-haspopup': 'dialog', 'aria-expanded': open,
      'aria-description': 'Hold to preview description. Tap to open project.',
      style: { ...children.props.style, WebkitTouchCallout: 'none', userSelect: 'none' } }) : children}
    <AnimatePresence>
      {open && isEnabled && <ModalPortal><motion.div data-project-description-overlay="" data-presentation="mobile"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}
        onPointerDown={(event) => { stop(event); if (event.target === event.currentTarget) { event.preventDefault(); close(); } }}
        onPointerUp={stop} onClick={stop} onContextMenu={(event) => event.preventDefault()}>
        <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Description of ${project.title}`} tabIndex={-1}
          data-project-description-preview="" initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} transition={{ duration: reducedMotion ? 0 : 0.15 }}>
          <button type="button" onClick={close} className="sr-only focus:not-sr-only">Close description</button>
          <p style={{ fontFamily: typefaceStack }}>{project.summary?.trim() || 'No description has been added for this project.'}</p>
        </motion.div>
      </motion.div></ModalPortal>}
    </AnimatePresence>
  </>;
}
