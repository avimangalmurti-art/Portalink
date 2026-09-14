import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AppearanceTheme } from '../utils/appearancePreferences';
import { ResponsiveImage } from './ui/ResponsiveImage';
const LIGHT_LOGO_URL = '/image.png';
const DARK_LOGO_URL = '/image-dark.png';
export function SplashScreen({ theme }: { theme: AppearanceTheme }) {
  const shouldReduceMotion = useReducedMotion();
  return <motion.div role="status" aria-label="Loading Portalink" className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[var(--surface-overlay)]" initial={{
    opacity: 1
  }} exit={{
    opacity: 0
  }} transition={{
    duration: shouldReduceMotion ? 0 : 0.45,
    ease: [0.22, 1, 0.36, 1]
  }}>
      <div className="h-24 w-24">
        <div className="h-full w-full">
          <ResponsiveImage src={theme === 'dark' ? DARK_LOGO_URL : LIGHT_LOGO_URL} decorative width={1254} height={1254} sizes="96px" priority className="h-full w-full object-contain" />
        </div>
      </div>
      <p className="text-medium font-semibold tracking-tight text-[var(--text-primary)]">Portalink</p>
    </motion.div>;
}
