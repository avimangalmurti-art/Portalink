import { motionMs } from '../presentation/motion/motion';
import { useLayoutEffect, useRef, useState } from 'react';

export type ScreenPhase = 'screen-active' | 'screen-next' | 'screen-exit';

export type ScreenTransitionLayer<T> = {
  id: number;
  screenKey: string;
  phase: ScreenPhase;
  snapshot: T;
};


/**
 * Route-only screen state controller.
 *
 * It retains at most the outgoing and incoming workspace snapshots while their
 * structural classes transition. The screen content itself is opaque to this
 * controller, so canvas lifecycles, nested scrollers, and streaming timelines
 * receive no animation state and no style mutations.
 */
export function useScreenTransition<T>(
  screenKey: string,
  snapshot: T,
  reduceMotion: boolean,
  skipLayerTransition = false
): ScreenTransitionLayer<T>[] {
  const motionUpdating = typeof document !== 'undefined' && document.documentElement?.dataset.motionUpdating === 'true';
  const nextIdRef = useRef(1);
  const committedKeyRef = useRef(screenKey);
  const committedSnapshotRef = useRef(snapshot);
  const nextSnapshotRef = useRef(snapshot);
  const [layers, setLayers] = useState<ScreenTransitionLayer<T>[]>([{
    id: 0,
    screenKey,
    phase: 'screen-active',
    snapshot
  }]);

  nextSnapshotRef.current = snapshot;
  if (screenKey === committedKeyRef.current) {
    committedSnapshotRef.current = snapshot;
  }

  useLayoutEffect(() => {
    if (screenKey === committedKeyRef.current) {
      return undefined;
    }

    const outgoingKey = committedKeyRef.current;
    const outgoingSnapshot = committedSnapshotRef.current;
    const incomingSnapshot = nextSnapshotRef.current;
    const incomingId = nextIdRef.current;
    nextIdRef.current += 1;

    committedKeyRef.current = screenKey;
    committedSnapshotRef.current = incomingSnapshot;

    if (reduceMotion || skipLayerTransition || motionUpdating) {
      setLayers([{
        id: incomingId,
        screenKey,
        phase: 'screen-active',
        snapshot: incomingSnapshot
      }]);
      return undefined;
    }

    setLayers((current) => {
      const existingOutgoing = current.find((layer) => layer.screenKey === outgoingKey);
      return [{
        id: existingOutgoing?.id ?? nextIdRef.current++,
        screenKey: outgoingKey,
        phase: 'screen-exit',
        snapshot: outgoingSnapshot
      }, {
        id: incomingId,
        screenKey,
        phase: 'screen-next',
        snapshot: incomingSnapshot
      }];
    });

    // Two frames guarantee that `.screen-next` is committed once before it is
    // promoted to `.screen-active`, giving the browser a real transition edge.
    let secondFrame = 0;
    let cleanupTimer = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setLayers((current) => current.map((layer) => layer.id === incomingId ? {
          ...layer,
          phase: 'screen-active'
        } : layer));
        cleanupTimer = window.setTimeout(() => {
          setLayers((current) => current.filter((layer) => layer.id === incomingId));
        }, motionMs('base'));
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(cleanupTimer);
    };
  }, [reduceMotion, screenKey, skipLayerTransition, motionUpdating]);

  // Same-route data updates replace only the active snapshot. They do not start
  // a navigation transition or remount the layer that owns the current screen.
  if ((skipLayerTransition || motionUpdating) && screenKey !== committedKeyRef.current) {
    return [{
      id: nextIdRef.current,
      screenKey,
      phase: 'screen-active',
      snapshot
    }];
  }

  return layers.map((layer) => layer.screenKey === screenKey ? {
    ...layer,
    snapshot
  } : layer);
}
