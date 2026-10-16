import './mobile/pull-dismiss-mobile.css';
import { UNSAFE_LocationContext, type Location, type NavigationType } from 'react-router-dom';
import { finishPullDismiss } from './mobile/pullDismissMotion';
import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useScreenTransition } from '../app/useScreenTransition';
import { MobileBackScope } from './mobile/MobileBackNavigation';
import {
  getMobileScreenNavigationMark,
  getServerMobileScreenNavigationMark,
  isMobileScreenNavigationFresh,
  subscribeMobileScreenNavigation
} from './mobile/backNavigationTransition';
import { usePresentation } from './usePresentation';

type RouteContext = { location: Location; navigationType: NavigationType };
type ScreenSnapshot = { mainClassName: string; ariaLabel: string; content: React.ReactNode; routeContext?: RouteContext };
type Navigation = RouteContext & { scope: string };

/** Mobile profile destinations update one workspace instead of replacing its header. */
export function AppScreenLayers({ screenKey, mobileProfileKey, snapshot, reduceMotion, skipLayerTransition, mainContentRef, onScroll, navigation }: {
  screenKey: string;
  navigation?: Navigation;
  mobileProfileKey?: string;
  snapshot: ScreenSnapshot;
  reduceMotion: boolean;
  skipLayerTransition: boolean;
  mainContentRef: React.RefObject<HTMLElement>;
  onScroll: React.UIEventHandler<HTMLElement>;
}) {
  const presentation = usePresentation();
  useLayoutEffect(() => { if (typeof document === 'undefined') return; if (document.documentElement.dataset.mobilePullDismiss === 'committing') finishPullDismiss(); delete document.documentElement.dataset.mobileStackNavigation; }, [navigation?.location.key]);
  const navigationMark = useSyncExternalStore(subscribeMobileScreenNavigation, getMobileScreenNavigationMark, getServerMobileScreenNavigationMark);
  const identity = useRef({ screenKey, mobileProfileKey, layerKey: presentation === 'mobile' && mobileProfileKey ? mobileProfileKey : screenKey });
  if (identity.current.screenKey !== screenKey || identity.current.mobileProfileKey !== mobileProfileKey) {
    // A marked move keeps the leaving workspace mounted for one transition so the
    // two screens can travel together. Unmarked mobile navigation still retains
    // the layer, so an expired or absent mark falls back to existing behavior.
    const isDirectedNavigation = presentation === 'mobile' && !reduceMotion && !skipLayerTransition &&
      isMobileScreenNavigationFresh(navigationMark);
    const sameMobileProfile = !isDirectedNavigation && presentation === 'mobile' && mobileProfileKey && identity.current.mobileProfileKey === mobileProfileKey;
    const destinationKey = presentation === 'mobile' && mobileProfileKey ? mobileProfileKey : screenKey;
    // A retained mobile key may name an earlier WEB destination after resizing.
    const nextKey = destinationKey === identity.current.layerKey ? `${destinationKey}:next` : destinationKey;
    identity.current = {
      screenKey,
      mobileProfileKey,
      layerKey: sameMobileProfile ? identity.current.layerKey : nextKey,
    };
  }
  // Resizing alone never replaces a mounted workspace or its unsaved state.
  const activeKey = identity.current.layerKey;
  const layers = useScreenTransition(activeKey, { ...snapshot, routeContext: navigation }, reduceMotion, skipLayerTransition, presentation === 'mobile' && navigation ? { entryKey: navigation.location.key, action: navigation.navigationType, scope: navigation.scope, reset: typeof document !== 'undefined' && document.documentElement.dataset.mobileStackNavigation === 'dock' } : undefined, navigation?.scope);
  return <>{layers.map(layer => <ScreenLayer key={layer.id} layer={layer} active={!layer.retained && layer.screenKey === activeKey} mobile={presentation === 'mobile'} navigation={navigation} mainContentRef={mainContentRef} onScroll={onScroll} />)}</>;
}

function ScreenLayer({ layer, active, mobile, navigation, mainContentRef, onScroll }: {
  layer: ReturnType<typeof useScreenTransition<ScreenSnapshot>>[number]; active: boolean; mobile: boolean; navigation?: Navigation;
  mainContentRef: React.RefObject<HTMLElement>; onScroll: React.UIEventHandler<HTMLElement>;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const saved = useRef<{ outside: Array<[HTMLElement, number, number]>; inside: Array<[HTMLElement, number, number]>; material: Array<[HTMLElement, string]> }>({ outside: [], inside: [], material: [] });
  const state = useRef({ active, underlay: layer.underlay }); state.current = { active, underlay: layer.underlay };
  useLayoutEffect(() => {
    if (!mobile) return;
    const capture = () => {
      const element = host.current;
      if (!element || !state.current.active) return;
      const outside = new Set<HTMLElement>();
      for (let parent = element.parentElement; parent; parent = parent.parentElement) outside.add(parent);
      if (document.scrollingElement) outside.add(document.scrollingElement as HTMLElement);
      saved.current = {
        outside: [...outside].map(node => [node, node.scrollTop, node.scrollLeft]),
        material: [...element.querySelectorAll<HTMLElement>('[data-mobile-header-underlap]')].map(node => [node, node.dataset.mobileHeaderUnderlap ?? 'false']),
        inside: [element, ...element.querySelectorAll<HTMLElement>('[class*="overflow"], [data-screen-scroll], .mobile-profile-wall, .feed-edge-fade, [data-mobile-scroll-end]')].map(node => [node, node.scrollTop, node.scrollLeft]),
      };
    };
    const reveal = () => {
      const element = host.current;
      if (!element || !state.current.underlay) return;
      for (const [node, top, left] of saved.current.inside) { node.scrollTop = top; node.scrollLeft = left; }
      for (const [node, value] of saved.current.material) node.dataset.mobileHeaderUnderlap = value;
      element.scrollTop = saved.current.outside.reduce((sum, [, top]) => sum + top, 0);
    };
    document.addEventListener('portalink-before-navigation', capture);
    window.addEventListener('popstate', capture);
    document.addEventListener('portalink-reveal-underlay', reveal);
    return () => { document.removeEventListener('portalink-before-navigation', capture); window.removeEventListener('popstate', capture); document.removeEventListener('portalink-reveal-underlay', reveal); };
  }, [mobile]);
  useLayoutEffect(() => {
    if (!mobile || !active || !layer.restored) return;
    // Restore DOM offsets before paint, not through an entrance animation or a refetch.
    finishPullDismiss();
    for (const [node, top, left] of [...saved.current.inside, ...saved.current.outside]) { node.scrollTop = top; node.scrollLeft = left; }
  }, [active, layer.restored, mobile]);
  const scope = <MobileBackScope active={active} enabled={false}>{layer.snapshot.content}</MobileBackScope>;
  const context = mobile || layer.retained ? layer.snapshot.routeContext : navigation;
  return <div ref={element => { host.current = element; if (element) element.inert = !active; }} className={`app-screen-layer ${layer.phase}`} aria-hidden={!active || undefined}
    data-mobile-screen-retained={layer.retained ? '' : undefined} data-mobile-screen-underlay={mobile && layer.underlay ? '' : undefined} data-mobile-screen-restored={mobile && active && layer.restored ? '' : undefined}>
    <main ref={active ? mainContentRef : undefined} tabIndex={-1} onScroll={active ? onScroll : undefined} className={layer.snapshot.mainClassName} aria-label={layer.snapshot.ariaLabel}>
      {context ? <UNSAFE_LocationContext.Provider value={context}>{scope}</UNSAFE_LocationContext.Provider> : scope}
    </main>
  </div>;
}
