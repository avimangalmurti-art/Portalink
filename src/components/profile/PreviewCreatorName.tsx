import { motionMs, motionEase } from '../../presentation/motion/motion';
import React, { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePresentation } from '../../presentation/usePresentation';

/** Reveal the hidden end of a mobile attribution without moving its avatar. */
export function PreviewCreatorName({ name, active, centered = false }: { name: string; active: boolean; centered?: boolean }) {
  const isMobile = usePresentation() === 'mobile';
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!isMobile || !active || reduceMotion || !viewport || !text) return;

    let animation: Animation | undefined;
    let previousDistance = -1;
    const measure = () => {
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      viewport.toggleAttribute('data-name-overflow', distance > 1);
      if (distance === previousDistance) return;
      previousDistance = distance;
      animation?.cancel();
      animation = undefined;
      if (distance <= 1) return;

      const travelTime = Math.max(1200, distance / 22 * 1000);
      const end = `translateX(-${distance}px)`;
      // Connection labels are continuous reading motion, not a screen transition.
      const duration = centered ? travelTime + 2400 : motionMs('slow');
      animation = text.animate(centered ? [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: 1200 / duration, easing: 'ease-in-out' },
        { transform: end, offset: (1200 + travelTime) / duration },
        { transform: end, offset: 1 },
      ] : [
        { transform: 'translateX(0)' },
        { transform: end, offset: travelTime / (travelTime + 1200) },
        { transform: end },
      ], { duration, iterations: Infinity, direction: 'alternate', easing: centered ? 'linear' : motionEase() });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    measure();
    return () => { observer.disconnect(); animation?.cancel(); viewport.removeAttribute('data-name-overflow'); };
  }, [active, centered, isMobile, name, reduceMotion]);

  if (!isMobile) return <span className="min-w-0 truncate text-left text-[11px] font-semibold">{name}</span>;

  return <span ref={viewportRef} data-preview-creator-name="" data-name-centered={centered ? '' : undefined} data-name-reduced-motion={reduceMotion ? '' : undefined} className={`min-w-0 flex-1 overflow-hidden text-left text-[11px] font-semibold ${reduceMotion ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}>
    <span ref={textRef} className={reduceMotion ? 'block' : 'block w-max'}>{name}</span>
  </span>;
}
