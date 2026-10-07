import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Presentation } from '../usePresentation';
import { PORTALINK_SPLASH_EXIT_EVENT } from '../../app/splashLifecycle';

/** Keep the phone's surrounding canvas in the same appearance as the page. */
export function useMobileBrowserSurface(presentation: Presentation, appearance: CSSProperties | undefined) {
  const frameRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (presentation !== 'mobile' || !frameRef.current) return;

    const surfaces = [document.documentElement, document.body];
    const backgrounds = surfaces.map(element => ({
      value: element.style.getPropertyValue('background-color'),
      priority: element.style.getPropertyPriority('background-color'),
    }));
    const existing = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const tags = existing.length ? existing : [document.createElement('meta')];
    if (!existing.length) {
      tags[0].name = 'theme-color';
      document.head.appendChild(tags[0]);
    }
    const attributes = tags.map(tag => ({ content: tag.getAttribute('data-portalink-theme-original') ?? tag.getAttribute('content'), media: tag.getAttribute('media') }));

    const sync = () => {
      if (!frameRef.current) return;
      // This is the actual workspace token, including the public visitor's
      // resolved appearance. It is independent of the phone's OS preference.
      const color = getComputedStyle(frameRef.current).getPropertyValue('--codex-workspace-bg').trim();
      if (!color) return;
      surfaces.forEach(element => element.style.setProperty('background-color', color));
      tags.forEach(tag => {
        tag.setAttribute('content', color);
        // Both OS selectors use the resolved in-app color. Keep the selectors
        // so restoring WEB also restores its original metadata exactly.
      });
    };
    sync();
    // iOS may sample the startup video's backdrop; reassert the page surface
    // when that full-screen layer has completely disappeared.
    window.addEventListener(PORTALINK_SPLASH_EXIT_EVENT, sync);
    return () => {
      window.removeEventListener(PORTALINK_SPLASH_EXIT_EVENT, sync);
      surfaces.forEach((element, index) => {
        const { value, priority } = backgrounds[index];
        if (value) element.style.setProperty('background-color', value, priority);
        else element.style.removeProperty('background-color');
      });
      tags.forEach((tag, index) => {
        if (!existing.length) { tag.remove(); return; }
        for (const name of ['content', 'media'] as const) {
          const value = attributes[index][name];
          if (value === null) tag.removeAttribute(name);
          else tag.setAttribute(name, value);
        }
      });
    };
  }, [presentation, appearance]);
  return frameRef;
}
