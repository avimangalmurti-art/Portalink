import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** Portalink's quiet, theme-aware startup signature. */
export function PortalinkSplashLoader() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      data-portalink-splash="true"
      role="status"
      aria-live="polite"
      aria-label="Portalink Networks is opening"
      className="portalink-splash fixed inset-0 z-[1000] grid min-h-[100dvh] w-full place-items-center overflow-hidden"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="portalink-splash-lockup flex flex-col items-center"
        initial={shouldReduceMotion ? false : { opacity: 0.72, y: 3, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.46, ease: [0.22, 1, 0.36, 1] }}
      >
        <img
          src="/portalink-splash-character.png"
          alt=""
          aria-hidden="true"
          width={222}
          height={372}
          className="portalink-splash-character h-auto w-[clamp(108px,18vmin,148px)] max-w-[48vw] object-contain"
        />
        <p className="portalink-splash-wordmark mt-3 text-center text-[12px] font-semibold uppercase leading-none tracking-[0.18em]">
          Portalink Networks
        </p>
      </motion.div>
    </motion.div>
  );
}
