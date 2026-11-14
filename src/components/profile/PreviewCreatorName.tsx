import { motionMs, motionEase } from '../../presentation/motion/motion';
import React, { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePresentation } from '../../presentation/usePresentation';

/** Reveal the hidden end of a mobile label without moving adjacent controls. */
export function PreviewCreatorName({ name, active, centered = false, visibleOnly = false, fadeInset = 0, className = 'text-[11px] font-semibold' }: {
  name: string; active: boolean; centered?: boolean; visibleOnly?: boolean; fadeInset?: number; className?: string;
}) {
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
    let visible = !visibleOnly || typeof IntersectionObserver === 'undefined';
    const measure = () => {
      const overflow = Math.max(0, text.scrollWidth - viewport.clientWidth);
      viewport.toggleAttribute('data-name-overflow', overflow > 1);
      const distance = visible ? overflow : 0;
      if (distance === previousDistance) return;
      previousDistance = distance;
      animation?.cancel();
      animation = undefined;
      if (distance <= 1) return;

      // Keep the first and last glyphs clear of the mask at the pauses.
      const travelTime = Math.max(1200, (distance + 2 * fadeInset) / 22 * 1000);
      const start = fadeInset ? `translateX(${fadeInset}px)` : 'translateX(0)';
      const end = `translateX(-${distance + fadeInset}px)`;
      // Connection labels are continuous reading motion, not a screen transition.
      const duration = centered ? travelTime + 2400 : motionMs('slow');
      animation = text.animate(centered ? [
        { transform: start, offset: 0 },
        { transform: start, offset: 1200 / duration, easing: 'ease-in-out' },
        { transform: end, offset: (1200 + travelTime) / duration },
        { transform: end, offset: 1 },
      ] : [
        { transform: start },
        { transform: end, offset: travelTime / (travelTime + 1200) },
        { transform: end },
      ], { duration, iterations: Infinity, direction: 'alternate', easing: centered ? 'linear' : motionEase() });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(text);
    const visibility = visible ? null : new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      measure();
    });
    visibility?.observe(viewport);
    measure();
    return () => {
      observer.disconnect();
      visibility?.disconnect();
      animation?.cancel();
      viewport.removeAttribute('data-name-overflow');
    };
  }, [active, centered, fadeInset, isMobile, name, reduceMotion, visibleOnly]);

  if (!isMobile) return <span className={`min-w-0 truncate text-left ${className}`}>{name}</span>;

  return <span ref={viewportRef} data-preview-creator-name="" data-name-centered={centered ? '' : undefined} data-name-reduced-motion={reduceMotion ? '' : undefined}
    style={fadeInset ? { '--portal-title-fade': `${fadeInset}px` } as React.CSSProperties : undefined}
    className={`min-w-0 flex-1 overflow-hidden text-left ${className} ${reduceMotion ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}>
    <span ref={textRef} className={reduceMotion ? 'block' : 'block w-max'}>{name}</span>
  </span>;
}
