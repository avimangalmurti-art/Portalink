import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Presentation } from '../usePresentation';
import { PORTALINK_SPLASH_EXIT_EVENT } from '../../app/splashLifecycle';

const welcomeSelector = '[data-portalink-splash][data-presentation="mobile"]:not([aria-hidden="true"]) .professional-entry';
const inviteSplashSelector = 'html[data-invite-launch] #portalink-preboot, [data-portalink-invite-splash]:not([aria-hidden="true"])';
const projectOpeningSelector = '[data-presentation="mobile"] [data-project-opening-loader]';
const visibleOpeningSurface = () => document.querySelector<HTMLElement>(inviteSplashSelector)
  ?? document.querySelector<HTMLElement>(welcomeSelector)
  ?? document.querySelector<HTMLElement>(projectOpeningSelector);

/** Keep the phone's surrounding canvas in the same appearance as the page. */
export function useMobileBrowserSurface(presentation: Presentation, appearance: CSSProperties | undefined) {
  const frameRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (presentation !== 'mobile' || !frameRef.current) return;

    const surfaces = [document.documentElement, document.body];
    const backgrounds = surfaces.map(element => ({
      value: element.style.getPropertyValue('background-color'),
      priority: element.style.getPropertyPriority('background-color'),
    }));
    const bodyScheme = { value: document.body.style.getPropertyValue('color-scheme'), priority: document.body.style.getPropertyPriority('color-scheme') };
    const existing = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const tags = existing.length ? existing : [document.createElement('meta')];
    if (!existing.length) {
      tags[0].name = 'theme-color';
      document.head.appendChild(tags[0]);
    }
    const attributes = tags.map(tag => ({ content: tag.getAttribute('data-portalink-theme-original') ?? tag.getAttribute('content'), media: tag.getAttribute('media') }));

    let activeOpening: HTMLElement | null = null;
    const sync = () => {
      if (!frameRef.current) return;
      // The visible welcome owns its canvas, including explicit appearance choices.
      // Otherwise retain the committed frame, including public creator branding.
      activeOpening = visibleOpeningSurface();
      const style = getComputedStyle(activeOpening ?? frameRef.current);
      const color = activeOpening ? style.backgroundColor : style.getPropertyValue('--codex-workspace-bg').trim();
      if (!color) return;
      surfaces.forEach(element => element.style.setProperty('background-color', color));
      // App/VisitorApp own the document scheme across presentations. Only the
      // body override belongs here, keeping portalled controls in sync now.
      if (style.colorScheme === 'light' || style.colorScheme === 'dark') {
        document.body.style.setProperty('color-scheme', style.colorScheme);
      }
      tags.forEach(tag => tag.setAttribute('content', color));
    };
    const visible = () => { if (document.visibilityState === 'visible') sync(); };
    syncRef.current = sync;
    sync();
    // An opening surface can mount outside this frame without changing its appearance prop.
    // Only a change of visible surface repaints; ordinary feed mutations do not.
    const observer = new MutationObserver(records => {
      if (visibleOpeningSurface() !== activeOpening
        || records.some(record => record.target === activeOpening && record.attributeName === 'data-entry-theme')) sync();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['aria-hidden', 'data-presentation', 'data-entry-theme', 'data-portalink-invite-splash'] });
    const system = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (system?.addEventListener) system.addEventListener('change', sync);
    else system?.addListener?.(sync);
    // iOS can restore a stale chrome/snapshot color on resume or sample the
    // startup backdrop. Reassert the same canvas without remounting a screen.
    window.addEventListener(PORTALINK_SPLASH_EXIT_EVENT, sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', visible);
    return () => {
      syncRef.current = null;
      observer.disconnect();
      if (system?.removeEventListener) system.removeEventListener('change', sync);
      else system?.removeListener?.(sync);
      window.removeEventListener(PORTALINK_SPLASH_EXIT_EVENT, sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', visible);
      surfaces.forEach((element, index) => {
        const { value, priority } = backgrounds[index];
        if (value) element.style.setProperty('background-color', value, priority);
        else element.style.removeProperty('background-color');
      });
      if (bodyScheme.value) document.body.style.setProperty('color-scheme', bodyScheme.value, bodyScheme.priority);
      else document.body.style.removeProperty('color-scheme');
      tags.forEach((tag, index) => {
        if (!existing.length) { tag.remove(); return; }
        for (const name of ['content', 'media'] as const) {
          const value = attributes[index][name];
          if (value === null) tag.removeAttribute(name);
          else tag.setAttribute(name, value);
        }
      });
    };
  }, [presentation]);
  // Theme changes repaint in the same commit. Keep lifetime snapshots/listeners
  // intact rather than restoring the old browser colors between appearances.
  useLayoutEffect(() => { syncRef.current?.(); }, [presentation, appearance]);
  return frameRef;
}
