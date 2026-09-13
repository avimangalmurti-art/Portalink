import React, { useRef } from 'react';
import { useScreenTransition } from '../app/useScreenTransition';
import { MobileBackScope } from './mobile/MobileBackNavigation';
import { usePresentation } from './usePresentation';

type ScreenSnapshot = { mainClassName: string; ariaLabel: string; content: React.ReactNode };

/** Mobile profile destinations update one workspace instead of replacing its header. */
export function AppScreenLayers({ screenKey, mobileProfileKey, snapshot, reduceMotion, skipLayerTransition, mainContentRef, onScroll }: {
  screenKey: string;
  mobileProfileKey?: string;
  snapshot: ScreenSnapshot;
  reduceMotion: boolean;
  skipLayerTransition: boolean;
  mainContentRef: React.RefObject<HTMLElement>;
  onScroll: React.UIEventHandler<HTMLElement>;
}) {
  const presentation = usePresentation();
  const identity = useRef({ screenKey, mobileProfileKey, layerKey: presentation === 'mobile' && mobileProfileKey ? mobileProfileKey : screenKey });
  if (identity.current.screenKey !== screenKey || identity.current.mobileProfileKey !== mobileProfileKey) {
    const sameMobileProfile = presentation === 'mobile' && mobileProfileKey && identity.current.mobileProfileKey === mobileProfileKey;
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
  const layers = useScreenTransition(activeKey, snapshot, reduceMotion, skipLayerTransition);
  return <>{layers.map(layer => <div key={layer.id} className={`app-screen-layer ${layer.phase}`} aria-hidden={layer.phase === 'screen-exit' ? true : undefined} ref={element => {
    if (element) element.inert = layer.phase === 'screen-exit';
  }}>
    <main ref={layer.screenKey === activeKey ? mainContentRef : undefined} tabIndex={-1} onScroll={layer.screenKey === activeKey ? onScroll : undefined} className={layer.snapshot.mainClassName} aria-label={layer.snapshot.ariaLabel}>
      <MobileBackScope active={layer.screenKey === activeKey} enabled={false}>
        {layer.snapshot.content}
      </MobileBackScope>
    </main>
  </div>)}</>;
}
