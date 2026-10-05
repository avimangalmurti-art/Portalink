import { focusMobileContextButton } from './contextFocus';
import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { EllipsisIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePresentation } from '../usePresentation';
import { useMobileScreenActive } from './MobileBackNavigation';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { MobileActionSheet } from '../../components/messages/MobileActionSheet';
import { mergeContextActions, type ContextActions, type ContextAction } from './contextActions';

type Registration = { route: string; priority: number; model: ContextActions };
type ModelSource = ContextActions | (() => ContextActions | null);
type Context = { register: (id: string, value: Registration | null) => void; open: (model?: ModelSource) => void; refresh: (source: ModelSource) => void; opened: boolean; button: React.RefObject<HTMLButtonElement>; hint: boolean };
const MobileActions = createContext<Context | null>(null);
const hintKey = 'portalink.contextActions.discovered';
const shape = (value: Registration) => JSON.stringify([value.route, value.priority, value.model.viewer, value.model.title, value.model.primary.map(a => [a.id, a.label]), value.model.groups.map(g => g.map(a => [a.id, a.label]))]);
export function MobileContextProvider({ children, sheet: Sheet = MobileActionSheet }: { children: React.ReactNode; sheet?: React.ComponentType<React.ComponentProps<typeof MobileActionSheet>> }) {
  const { pathname, search } = useLocation(), route = pathname + search, mobile = usePresentation() === 'mobile';
  const auth = useAuth();
  const identity = `${route}:${auth.user?.id ?? 'guest'}:${mobile}`;
  const identityRef = useRef(identity); identityRef.current = identity;
  const entries = useRef(new Map<string, Registration>()), button = useRef<HTMLButtonElement | null>(null);
  const [revision, setRevision] = useState(0), [opened, setOpened] = useState<{ identity: string; source?: ModelSource } | null>(null), [notice, setNotice] = useState('');
  const [hint, setHint] = useState(() => { try { return localStorage.getItem(hintKey) !== '1'; } catch { return true; } });
  const register = useCallback((id: string, value: Registration | null) => {
    const previous = entries.current.get(id);
    if (value) entries.current.set(id, value); else entries.current.delete(id);
    if ((previous ? shape(previous) : '') !== (value ? shape(value) : '')) setRevision(n => n + 1);
  }, []);
  const refresh = useCallback((source: ModelSource) => setOpened(current => current?.source === source ? { ...current } : current), []);
  const currentScreen = () => mergeContextActions([...entries.current.values()].filter(item => item.route === route).sort((a, b) => b.priority - a.priority).map(item => item.model));
  const focusContext = () => { button.current = focusMobileContextButton(); };
  const open = (source?: ModelSource) => {
    focusContext();
    setOpened({ identity, source }); setHint(false); setNotice('');
    try { localStorage.setItem(hintKey, '1'); } catch { /* Convenience only. */ }
  };
  useEffect(() => { setOpened(null); setNotice(''); }, [identity]);
  useEffect(() => () => { identityRef.current = ''; }, []);
  const resolve = () => opened?.identity !== identity ? null : opened.source ? typeof opened.source === 'function' ? opened.source() : opened.source : currentScreen();
  const model = resolve();
  const close = () => {
    flushSync(() => setOpened(null));
    focusContext();
  };
  const run = (selected: ContextAction) => {
    // Re-resolve capabilities immediately before invoking an action. Native share
    // and clipboard keep the user's activation; the old focus trap is gone first.
    const latest = resolve();
    const action = latest && [...latest.primary, ...latest.groups.flat()].find(item => item.id === selected.id);
    close();
    if (!action) return;
    try { Promise.resolve(action.run()).catch(error => { if (identityRef.current === identity) setNotice(error instanceof Error ? error.message : 'This action could not be completed. Please try again.'); }); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'This action could not be completed.'); }
  };
  void revision;
  return <MobileActions.Provider value={{ register, open, refresh, opened: Boolean(model), button, hint }}>{children}{mobile && currentScreen() && <MobileContextButton floating />}{mobile && model && <Sheet model={model} onClose={close} onAction={run} />}{mobile && notice && <div className="mobile-context-notice" role="alert">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss action message">×</button></div>}</MobileActions.Provider>;
}
export function useMobileScreenActions(model: ContextActions | null, priority = 10) {
  const context = useContext(MobileActions), id = useId(), { pathname, search } = useLocation(), mobile = usePresentation() === 'mobile';
  const register = context?.register, active = useMobileScreenActive();
  useLayoutEffect(() => { register?.(id, mobile && active && model ? { route: pathname + search, priority, model } : null); });
  useLayoutEffect(() => () => register?.(id, null), [register, id]);
}
export function MobileScreenActions({ model, priority = 0 }: { model: ContextActions; priority?: number }) { useMobileScreenActions(model, priority); return null; }
export function useMobileActions() { return useContext(MobileActions); }
export function MobileContextButton({ floating = false }: { floating?: boolean }) {
  const actions = useMobileActions();
  return <div className={floating ? 'mobile-context-floating' : 'mobile-context-slot'}><button ref={actions?.button} type="button" className="mobile-context-button mobile-dock-destination" data-keep-color="" aria-label="Actions for this screen" aria-haspopup="dialog" aria-expanded={actions?.opened ?? false} onClick={() => actions?.open()}><InterfaceIcon icon={EllipsisIcon} /></button></div>;
}
/** Held touch is supplementary to the visible context button; scrolling cancels it. */
export function useMobileHold(onHold: (() => void) | null) {
  const mobile = usePresentation() === 'mobile', enabled = mobile && Boolean(onHold);
  const timer = useRef<ReturnType<typeof setTimeout>>(), point = useRef<{ x: number; y: number; id: number } | null>(null), consumed = useRef(false), latest = useRef(onHold); latest.current = onHold;
  const cancel = () => { clearTimeout(timer.current); point.current = null; };
  useEffect(() => { if (!enabled) return; window.addEventListener('scroll', cancel, true); return () => { cancel(); window.removeEventListener('scroll', cancel, true); }; }, [enabled]);
  return mobile && onHold ? {
    onPointerDownCapture: (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) { cancel(); return; }
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"],button:not([data-preview-open]),a:not([data-preview-open])')) return;
      cancel(); consumed.current = false; point.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      timer.current = setTimeout(() => { if (latest.current) { consumed.current = true; latest.current(); } }, 550);
    },
    onPointerMoveCapture: (e: React.PointerEvent) => { if (point.current && (point.current.id !== e.pointerId || Math.hypot(e.clientX - point.current.x, e.clientY - point.current.y) > 10)) cancel(); },
    onPointerUpCapture: cancel, onPointerCancel: cancel,
    onClickCapture: (e: React.MouseEvent) => { if (consumed.current && e.detail !== 0) { e.preventDefault(); e.stopPropagation(); } consumed.current = false; },
    onContextMenu: (e: React.MouseEvent) => { if (e.target instanceof Element && e.target.closest('input,textarea')) return; e.preventDefault(); cancel(); latest.current?.(); },
  } : {};
}
export function useMobileContextPress(model: ContextActions | null, useScreen = false, onOpen?: () => void) {
  const actions = useMobileActions(), latest = useRef(model); latest.current = model;
  const source = useRef(() => latest.current), refresh = actions?.refresh;
  const signature = model ? shape({ route: '', priority: 0, model }) : '';
  useLayoutEffect(() => { refresh?.(source.current); }, [refresh, signature]);
  return useMobileHold(model ? () => { onOpen?.(); actions?.open(useScreen ? undefined : source.current); } : null);
}
