import { useCallback, useLayoutEffect, useRef } from 'react';
import { animate, useMotionValue, type AnimationPlaybackControls } from 'framer-motion';
import { reducedMotion } from '../../presentation/motion/motion';

const returnSpring = { type: 'spring' as const, stiffness: 300, damping: 20, mass: .8, restDelta: .1, restSpeed: .5 };

/** Home's rubber band changes only paint; feed geometry and request timing stay real. */
export function useHomeRefreshMotion({ enabled, refreshing, scope }: { enabled: boolean; refreshing: boolean; scope: object }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const offset = useMotionValue(0), opacity = useMotionValue(0);
  const latest = useRef({ enabled, refreshing, scope });
  latest.current = { enabled, refreshing, scope };
  const movement = useRef<AnimationPlaybackControls | null>(null), fade = useRef<AnimationPlaybackControls | null>(null);
  const mountedScope = useRef<object | null>(null);
  const ownsBand = useRef(false), awaitingRefresh = useRef(false);
  const stop = useCallback(() => { movement.current?.stop(); fade.current?.stop(); movement.current = null; fade.current = null; }, []);
  const settle = useCallback(() => {
    stop();
    const current = latest.current;
    const active = current.enabled && current.scope === mountedScope.current;
    const reduce = reducedMotion();
    indicatorRef.current?.setAttribute('data-refresh-reduced', String(reduce));
    if (!active || reduce) {
      offset.jump(active && current.refreshing ? 32 : 0); opacity.jump(active && current.refreshing ? 1 : 0); return;
    }
    const control = animate(offset, current.refreshing ? 32 : 0, returnSpring);
    movement.current = control;
    void control.then(() => {
      if (movement.current !== control || latest.current.scope !== mountedScope.current) return;
      if (!latest.current.refreshing) { ownsBand.current = false; awaitingRefresh.current = false; }
      if (Math.abs(offset.get()) < .1) offset.jump(0);
    });
    fade.current = animate(opacity, current.refreshing ? 1 : 0, { duration: .18, ease: 'easeOut' });
  }, [offset, opacity, stop]);

  useLayoutEffect(() => {
    mountedScope.current = scope;
    ownsBand.current = false; awaitingRefresh.current = false;
    const content = contentRef.current, indicator = indicatorRef.current;
    if (!enabled || !content) { mountedScope.current = null; stop(); offset.jump(0); opacity.jump(0); return; }
    // Reveal only once the tabs have cleared the stationary top indicator.
    const paintOpacity = (value: number) => { if (indicator) indicator.style.opacity = String(value * Math.min(1, Math.max(0, (offset.get() - 24) / 8))); };
    const paintOffset = (value: number) => {
      if (content) content.style.transform = enabled && Math.abs(value) > .01 ? `translate3d(0, ${value}px, 0)` : '';
      paintOpacity(opacity.get());
    };
    const unwatchOffset = offset.on('change', paintOffset), unwatchOpacity = opacity.on('change', paintOpacity);
    offset.jump(0); opacity.jump(0); paintOffset(0); paintOpacity(0);
    const interruptScroll = () => { ownsBand.current = false; awaitingRefresh.current = false; stop(); offset.jump(0); opacity.jump(0); };
    const keyScroll = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interruptScroll(); };
    // Let native scrolling take over before a transformed bottom edge can clamp.
    content?.addEventListener('wheel', interruptScroll, { passive: true });
    content?.addEventListener('keydown', keyScroll);
    window.addEventListener('scroll', interruptScroll, { passive: true });
    const preferenceChanged = () => settle();
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    preference?.addEventListener('change', preferenceChanged);
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (reducedMotion() !== (indicator?.getAttribute('data-refresh-reduced') === 'true')) settle();
    });
    for (let parent: HTMLElement | null = content; parent; parent = parent.parentElement) observer?.observe(parent, { attributes: true, attributeFilter: ['class'] });
    return () => {
      mountedScope.current = null; stop(); unwatchOffset(); unwatchOpacity();
      ownsBand.current = false; awaitingRefresh.current = false;
      content?.removeEventListener('wheel', interruptScroll); content?.removeEventListener('keydown', keyScroll);
      window.removeEventListener('scroll', interruptScroll); observer?.disconnect();
      preference?.removeEventListener('change', preferenceChanged);
      if (content) content.style.transform = '';
      if (indicator) indicator.style.opacity = '0';
    };
  }, [enabled, scope, offset, opacity, stop, settle]);

  useLayoutEffect(() => {
    if (refreshing) awaitingRefresh.current = false;
    else if (!awaitingRefresh.current) ownsBand.current = false;
    settle(); return stop;
  }, [enabled, refreshing, scope, settle, stop]);

  const onPull = useCallback((distance: number | null, willRefresh = false) => {
    const current = latest.current;
    if (!current.enabled || current.scope !== scope || mountedScope.current !== scope) return;
    if (distance === null) { ownsBand.current = willRefresh; awaitingRefresh.current = willRefresh; settle(); return; }
    stop();
    ownsBand.current = true;
    // Increasing resistance keeps even a long drag within a small, bounded band.
    const reduce = reducedMotion();
    indicatorRef.current?.setAttribute('data-refresh-reduced', String(reduce));
    offset.jump(reduce ? (current.refreshing ? 32 : 0) : Math.min(80, 112 * (1 - Math.exp(-Math.max(0, distance) / 150))));
    opacity.jump(distance >= 12 || current.refreshing ? 1 : 0);
  }, [scope, offset, opacity, settle, stop]);

  return { contentRef, indicatorRef, onPull };
}
