import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Portalink's quiet startup signature.
 *
 * One open-palm greeting replaces the rapidly changing hand sequence. The
 * character, wordmark, and progress trace share the same theme-aware first
 * frame as index.html, so React takes over without a colour or layout jump.
 */
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
        <svg aria-hidden="true" focusable="false" viewBox="0 0 420 600" className="portalink-splash-character h-auto w-[clamp(142px,24vmin,188px)] max-w-[58vw]">
          <defs>
            <clipPath id="portalink-loader-head-clip"><circle cx="164" cy="148" r="96" /></clipPath>
            <clipPath id="portalink-loader-torso-clip"><path d="M124 232 C95 244 78 287 75 344 C70 434 96 517 164 526 C232 517 258 434 253 344 C250 287 233 244 204 232 C185 243 143 243 124 232 Z" /></clipPath>
          </defs>

          <g className="portalink-splash-wave" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M214 247 C245 250 273 229 291 197" />
            <path d="M232 285 C271 275 302 248 318 220" />
            <path d="M291 197 C284 178 282 158 288 149 C294 141 303 149 311 165 L316 178 L315 123 C315 109 320 99 328 99 C337 99 339 109 336 123 L329 159 L340 118 C343 105 351 99 358 103 C366 107 363 119 359 131 L348 163 L357 137 C361 125 368 122 374 127 C380 132 376 144 371 155 L359 177 L366 160 C371 149 378 149 382 155 C386 161 379 172 374 181 L359 207 C350 224 333 230 317 221 C305 215 298 206 291 197 Z" />
            <path d="M318 220 C328 226 343 226 359 207" />
          </g>

          <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M117 239 C85 250 66 301 62 362 L58 420 C56 447 66 464 82 464 C96 464 103 449 98 431 C105 420 103 407 97 399 L102 353 C106 307 114 274 129 252" />
            <path d="M62 368 C74 373 86 374 99 370" />
            <g clipPath="url(#portalink-loader-torso-clip)">
              <path d="M164 228 L164 529" />
              <path d="M127 230 C105 300 106 457 139 523" />
              <path d="M201 230 C223 300 222 457 189 523" />
              <path d="M82 278 C118 305 208 305 246 278" />
              <path d="M75 346 C116 375 212 375 253 346" />
              <path d="M82 416 C122 447 206 447 246 416" />
              <path d="M102 486 C135 502 193 502 226 486" />
            </g>
            <path d="M124 232 C95 244 78 287 75 344 C70 434 96 517 164 526 C232 517 258 434 253 344 C250 287 233 244 204 232 C185 243 143 243 124 232 Z" />
            <g clipPath="url(#portalink-loader-head-clip)">
              <path d="M164 50 L164 246" />
              <path d="M145 52 C109 91 107 203 145 244" />
              <path d="M183 52 C219 91 221 203 183 244" />
              <path d="M78 108 C121 88 207 88 250 108" />
              <path d="M68 148 C113 158 215 158 260 148" />
              <path d="M79 193 C123 213 205 213 249 193" />
            </g>
            <circle cx="164" cy="148" r="96" />
          </g>
        </svg>

        <p className="portalink-splash-wordmark mt-3 text-center text-[12px] font-semibold uppercase leading-none tracking-[0.18em]">Portalink Networks</p>
        <span aria-hidden="true" className="portalink-splash-progress mt-4 block h-px w-20 overflow-hidden rounded-full"><span className="block h-full w-full origin-left" /></span>
      </motion.div>
    </motion.div>
  );
}
