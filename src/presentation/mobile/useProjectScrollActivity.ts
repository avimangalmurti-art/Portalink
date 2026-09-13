import { useEffect, useState, type RefObject } from 'react';

/** Follow the media scroller, including momentum, without changing its layout. */
export function useProjectScrollActivity(enabled: boolean, pathname: string, navigation: RefObject<HTMLElement | null>) {
  const [scrollingPath, setScrollingPath] = useState<string | null>(null);

  useEffect(() => {
    setScrollingPath(null);
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      clearTimeout(timer);
      timer = undefined;
      setScrollingPath(null);
    };
    const hasKeyboardFocus = () => Boolean(navigation.current?.querySelector(':focus-visible'));
    const scroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest('[data-project-stage]') ||
          !target.closest('[data-mobile-project-view]') ||
          target.closest('[inert], .screen-exit, [aria-hidden="true"]') || hasKeyboardFocus()) return;
      setScrollingPath(pathname);
      clearTimeout(timer);
      // A brief quiet period avoids flickering between individual scroll events.
      timer = setTimeout(restore, 200);
    };
    const focus = () => { if (hasKeyboardFocus()) restore(); };
    document.addEventListener('scroll', scroll, { capture: true, passive: true });
    document.addEventListener('focusin', focus);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('focusin', focus);
    };
  }, [enabled, pathname, navigation]);

  return enabled && scrollingPath === pathname;
}
