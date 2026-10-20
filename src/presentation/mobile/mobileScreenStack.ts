import type { ScreenTransitionLayer } from '../../app/useScreenTransition';

export type MobileStackNavigation = { entryKey: string; action: 'POP' | 'PUSH' | 'REPLACE'; scope: string; reset?: boolean };
type Frame<T> = ScreenTransitionLayer<T> & { entries: string[] };
export type MobileScreenStack<T> = { scope: string; entryKey: string; frames: Frame<T>[] };

/** Browser entry keys identify mounted instances; this never reconstructs URLs or navigates. */
export function advanceMobileScreenStack<T>(previous: MobileScreenStack<T> | null, navigation: MobileStackNavigation, screenKey: string, snapshot: T, allocate: () => number, initialId?: number): MobileScreenStack<T> {
  const create = (): Frame<T> => ({ id: initialId ?? allocate(), screenKey, snapshot, phase: 'screen-active', entries: [navigation.entryKey] });
  if (!previous || previous.scope !== navigation.scope) return { scope: navigation.scope, entryKey: navigation.entryKey, frames: [create()] };
  if (navigation.reset && previous.entryKey !== navigation.entryKey) {
    const current = previous.frames[previous.frames.length - 1];
    const frame = current.screenKey === screenKey ? { ...current, snapshot, entries: [navigation.entryKey], retained: false, underlay: false, restored: false } : create();
    return { scope: navigation.scope, entryKey: navigation.entryKey, frames: [frame] };
  }
  let frames = previous.frames;
  const found = frames.findIndex(frame => frame.entries.includes(navigation.entryKey));
  const active = frames[frames.length - 1];
  if (found >= 0) {
    frames = frames.slice(0, found + 1);
    frames[found] = { ...frames[found], screenKey, snapshot, restored: found < previous.frames.length - 1 || frames[found].restored };
  } else if (navigation.action === 'REPLACE' || active.screenKey === screenKey) {
    // Profile tabs and its nested reader share a workspace, as before.
    frames = [...frames.slice(0, -1), { ...active, screenKey, snapshot, restored: false, entries: navigation.action === 'REPLACE' ? active.entries.filter(key => key !== previous.entryKey).concat(navigation.entryKey) : [...active.entries, navigation.entryKey] }];
  } else if (navigation.action === 'POP') {
    frames = [create()]; // A pasted entry has no mounted predecessor in this app session.
  } else {
    frames = [...frames, create()];
  }
  return { scope: navigation.scope, entryKey: navigation.entryKey, frames: frames.map((frame, index) => ({ ...frame, phase: index === frames.length - 1 ? 'screen-active' : 'screen-exit', retained: index < frames.length - 1, underlay: index === frames.length - 2 })) };
}
