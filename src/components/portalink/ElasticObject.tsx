import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion, type AnimationControls } from 'framer-motion';

/**
 * Portalink Elasticity — the product's motion grammar for spatial change.
 *
 * Space changes, objects respond, connections persist. When an interface
 * boundary sweeps toward an object, the object takes the pressure directionally
 * rather than uniformly scaling: the side nearest the boundary gives first, the
 * far side follows a fraction later, mass is preserved (width narrows, height
 * swells slightly), and the stored energy returns as a single overshoot before
 * the geometry settles back to exact.
 *
 * Deformation lives on its own layers, so anything animating inside — the
 * planet's rotation in particular — is never reset, paused, or phase-jumped by
 * a spatial transition.
 */

// Pressure accumulates fast and releases slower, with one restrained overshoot.
const COMPRESS = {
  duration: 0.15,
  ease: [0.32, 0, 0.24, 1]
} as const;
const RELEASE = {
  type: 'spring',
  stiffness: 300,
  damping: 15,
  mass: 0.85
} as const;
// The far side lags the near side by a perceptible fraction, never a beat.
const FAR_SIDE_LAG = 0.045;
type ElasticObjectProps = {
  /**
   * Increment to send one pressure wave through the object. Re-incrementing
   * mid-flight continues from the object's current deformation rather than
   * restarting, so a reversed gesture stays one continuous physical state.
   */
  pressureKey: number;
  /** The side the moving boundary presses in from. */
  from?: 'left' | 'right';
  /** 0–1 of the canonical material travel. Small objects use less. */
  strength?: number;
  /** Releases the stored energy as a single outward connection ring. */
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
};
export function ElasticObject({
  pressureKey,
  from = 'right',
  strength = 1,
  pulse = false,
  className,
  children
}: ElasticObjectProps) {
  const shouldReduceMotion = useReducedMotion();
  const nearSide = useAnimationControls();
  const farSide = useAnimationControls();
  const [pulseKey, setPulseKey] = useState<number | null>(null);
  useEffect(() => {
    // No pressure on first paint, and none at all when motion is reduced:
    // the object holds its exact geometry instead.
    if (pressureKey === 0 || shouldReduceMotion) {
      return undefined;
    }
    let isCancelled = false;
    // Split across both layers so the compound deformation lands at roughly a
    // third off the width while the object keeps its visual mass.
    const squeeze = 0.17 * strength;
    const swell = 0.05 * strength;
    async function wave(controls: AnimationControls, delay: number) {
      await controls.start({
        scaleX: 1 - squeeze,
        scaleY: 1 + swell
      }, {
        ...COMPRESS,
        delay
      });
      if (isCancelled) {
        return;
      }
      controls.start({
        scaleX: 1,
        scaleY: 1
      }, RELEASE);
    }
    wave(nearSide, 0);
    wave(farSide, FAR_SIDE_LAG);
    if (pulse) {
      // The ring leaves as the energy returns, so it reads as one release.
      const timer = window.setTimeout(() => setPulseKey(pressureKey), 150);
      return () => {
        isCancelled = true;
        window.clearTimeout(timer);
      };
    }
    return () => {
      isCancelled = true;
    };
  }, [pressureKey, shouldReduceMotion, strength, pulse, nearSide, farSide]);
  const nearOrigin = from === 'right' ? '100% 50%' : '0% 50%';
  const farOrigin = from === 'right' ? '0% 50%' : '100% 50%';
  return <motion.span initial={false} animate={nearSide} className={className} style={{
    display: 'inline-flex',
    transformOrigin: nearOrigin
  }}>
      <motion.span initial={false} animate={farSide} style={{
      display: 'inline-flex',
      position: 'relative',
      transformOrigin: farOrigin
    }}>
        {children}
        {/* One ring, once: energy moving out through a connected system. */}
        <AnimatePresence>
          {pulseKey !== null && <motion.span key={pulseKey} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full" style={{
          border: '1px solid var(--accent-primary)'
        }} initial={{
          opacity: 0.5,
          scale: 1
        }} animate={{
          opacity: 0,
          scale: 1.45
        }} exit={{
          opacity: 0
        }} transition={{
          duration: 0.28,
          ease: [0.23, 1, 0.32, 1]
        }} onAnimationComplete={() => setPulseKey(null)} />}
        </AnimatePresence>
      </motion.span>
    </motion.span>;
}