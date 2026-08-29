import React from 'react';
import { AnimatePresence } from 'framer-motion';

type InteractionSafePresenceProps = {
  isPresent: boolean;
  children: React.ReactNode;
};

/**
 * Keeps a Framer Motion exit animation visible without leaving an invisible
 * click-blocking layer behind. The wrapper stays in the tree, so the moment the
 * controlled surface is dismissed it stops participating in pointer and
 * accessibility interaction even while its pixels finish fading out.
 */
export function InteractionSafePresence({
  isPresent,
  children
}: InteractionSafePresenceProps) {
  return <div className={`contents ${isPresent ? '' : 'pointer-events-none'}`} aria-hidden={isPresent ? undefined : true}>
      <AnimatePresence>{isPresent ? children : null}</AnimatePresence>
    </div>;
}
