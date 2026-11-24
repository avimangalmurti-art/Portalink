import { motionMs, motionEase, reducedMotion } from '../../presentation/motion/motion';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { usePresentation } from '../../presentation/usePresentation';

/** The row keeps focus and its hit area while only the name moves. */
export function CatalogueRowName({ name, className = '' }: { name: string; className?: string }) {
  const desktop = usePresentation() === 'web';
  const prefersReducedMotion = useReducedMotion();
  const labelRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    const button = labelRef.current?.closest('button');
    if (!desktop || prefersReducedMotion || !button) return;

    let hovering = window.matchMedia('(any-hover: hover)').matches && button.matches(':hover');
    let focused = button.matches(':focus-visible');
    const sync = () => setActive((hovering || focused) && !reducedMotion());
    const enter = (event: PointerEvent) => { hovering = event.pointerType !== 'touch'; sync(); };
    const leave = () => { hovering = false; sync(); };
    const focus = () => { focused = button.matches(':focus-visible'); sync(); };
    const blur = () => { focused = false; sync(); };
    button.addEventListener('pointerenter', enter);
    button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', focus);
    button.addEventListener('blur', blur);
    sync();
    return () => {
      button.removeEventListener('pointerenter', enter);
      button.removeEventListener('pointerleave', leave);
      button.removeEventListener('focus', focus);
      button.removeEventListener('blur', blur);
    };
  }, [desktop, prefersReducedMotion]);

  return <span ref={labelRef} title={name} data-catalogue-row-name={desktop ? '' : undefined} className={`min-w-0 truncate ${className}`}>
    {desktop && active && !prefersReducedMotion
      ? <PreviewCreatorName name={name} active centered animateOnWeb animatePosition fadeInset={8} className="block" />
      : name}
  </span>;
}

/** Reveal the hidden end of a label without moving adjacent controls. */
export function PreviewCreatorName({ name, active, centered = false, visibleOnly = false, fadeInset = 0, animateOnWeb = false, animatePosition = false, className = 'text-[11px] font-semibold' }: {
  name: string; active: boolean; centered?: boolean; visibleOnly?: boolean; fadeInset?: number; animateOnWeb?: boolean;
  /** Keep scrolling Portal row text on the clipped container's paint layer. */
  animatePosition?: boolean; className?: string;
}) {
  const animateOverflow = usePresentation() === 'mobile' || animateOnWeb;
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!animateOverflow || !active || reduceMotion || !viewport || !text
      || typeof ResizeObserver === 'undefined' || typeof text.animate !== 'function') return;

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
      viewport.removeAttribute('data-name-animating');
      if (distance <= 1) return;

      // Keep the first and last glyphs clear of the mask at the pauses.
      const travelTime = Math.max(1200, (distance + 2 * fadeInset) / 22 * 1000);
      const frameAt = (offset: number): Keyframe => animatePosition
        ? { left: `${offset}px` }
        : { transform: `translateX(${offset ? `${offset}px` : '0'})` };
      const start = frameAt(fadeInset);
      const end = frameAt(-distance - fadeInset);
      // Connection labels are continuous reading motion, not a screen transition.
      const duration = centered ? travelTime + 2400 : motionMs('slow');
      animation = text.animate(centered ? [
        { ...start, offset: 0 },
        { ...start, offset: 1200 / duration, easing: 'ease-in-out' },
        { ...end, offset: (1200 + travelTime) / duration },
        { ...end, offset: 1 },
      ] : [
        start,
        { ...end, offset: travelTime / (travelTime + 1200) },
        end,
      ], { duration, iterations: Infinity, direction: 'alternate', easing: centered ? 'linear' : motionEase() });
      if (animatePosition) viewport.setAttribute('data-name-animating', '');
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
      viewport.removeAttribute('data-name-animating');
    };
  }, [active, animateOverflow, animatePosition, centered, fadeInset, name, reduceMotion, visibleOnly]);

  if (!animateOverflow) return <span className={`min-w-0 truncate text-left ${className}`}>{name}</span>;

  return <span ref={viewportRef} data-preview-creator-name="" data-name-centered={centered ? '' : undefined} data-name-reduced-motion={reduceMotion ? '' : undefined}
    style={fadeInset ? { '--portal-title-fade': `${fadeInset}px` } as React.CSSProperties : undefined}
    className={`min-w-0 flex-1 overflow-hidden text-left ${className} ${reduceMotion ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}>
    <span ref={textRef} className={reduceMotion ? 'block' : animatePosition ? 'relative block w-max' : 'block w-max'}>{name}</span>
  </span>;
}
