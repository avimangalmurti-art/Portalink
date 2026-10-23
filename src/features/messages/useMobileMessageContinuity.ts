import { useCallback, useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import type { DirectMessage } from '../../types/messages';
import { motionEase, motionMs, reducedMotion } from '../../presentation/motion/motion';

type Reading = { top: number; left: number; bottom: boolean; height: number; extent: number; anchor?: string; offset?: number };
type Origin = { top: number; left: number; opener: HTMLElement | null; panel: HTMLElement };
type Options = {
  enabled: boolean; active: boolean; accountId: string | null | undefined; conversationId: string | null;
  messages: readonly DirectMessage[]; isLoadingThread: boolean; viewerProfileId: string | null | undefined;
  scroller: RefObject<HTMLElement>; list: RefObject<HTMLElement>; threadPanel: RefObject<HTMLElement>; listPanel: RefObject<HTMLElement>;
  isAtBottomRef: MutableRefObject<boolean>; preserveScrollRef: MutableRefObject<boolean>;
  markRead: () => void; setHasNewBelow: (value: boolean) => void;
};
type Entry = { id: string; account: string; loading: boolean; presented: boolean; interrupted: boolean; userScroll: boolean; userGeometry: { height: number; extent: number } | null; ids: Set<string>; lastId: string | null; count: number };

const atBottom = (node: HTMLElement) => node.scrollHeight - node.scrollTop - node.clientHeight < 80;
function readPosition(node: HTMLElement): Reading {
  const position: Reading = { top: node.scrollTop, left: node.scrollLeft, bottom: node.scrollHeight - node.scrollTop - node.clientHeight < 1, height: node.clientHeight, extent: node.scrollHeight };
  if (position.bottom || !node.isConnected) return position;
  const rows = node.querySelectorAll<HTMLElement>('[data-message-id]'), bounds = node.getBoundingClientRect();
  let low = 0, high = rows.length, reads = 0;
  // Find the first visible message without measuring the entire conversation.
  while (low < high && reads++ < 12) {
    const middle = (low + high) >>> 1;
    if (rows[middle].getBoundingClientRect().bottom <= bounds.top) low = middle + 1;
    else high = middle;
  }
  const row = rows[low], rect = row?.getBoundingClientRect();
  if (row?.dataset.messageId && rect && rect.top < bounds.bottom) { position.anchor = row.dataset.messageId; position.offset = rect.top - bounds.top; }
  return position;
}
function restorePosition(node: HTMLElement, position: Reading, anchorOnly = false) {
  if (position.bottom) { if (!anchorOnly) node.scrollTop = node.scrollHeight; }
  else {
    const row = position.anchor ? [...node.querySelectorAll<HTMLElement>('[data-message-id]')].find(item => item.dataset.messageId === position.anchor) : undefined;
    if (row) {
      const delta = row.getBoundingClientRect().top - node.getBoundingClientRect().top - (position.offset ?? 0);
      if (Math.abs(delta) > 0.5) node.scrollTop += delta;
    } else if (!anchorOnly) node.scrollTop = position.top;
  }
  if (!anchorOnly) node.scrollLeft = position.left;
}
const available = (node: HTMLElement | null | undefined): node is HTMLElement => Boolean(node?.isConnected && !node.closest('[inert], [aria-hidden="true"]') && !node.matches(':disabled') && node.getClientRects().length);
const geometryChanged = (node: HTMLElement, saved: Reading) => saved.height !== node.clientHeight || saved.extent !== node.scrollHeight;
function keyboardOwns(current: Options, node: HTMLElement) {
  const focused = document.activeElement;
  return Boolean(node.closest('[data-conversation-keyboard]') || (focused instanceof HTMLElement && current.threadPanel.current?.contains(focused) && focused.matches('input, textarea, select, [contenteditable="true"]')));
}

/** MOBILE owns reading position; transport, drafts, keyboard and WEB stay with their existing owners. */
export function useMobileMessageContinuity(options: Options) {
  const scrollerRef = options.scroller;
  const latest = useRef(options); latest.current = options;
  const memory = useRef({ account: options.accountId, positions: new Map<string, Reading>(), origin: null as Origin | null });
  if (memory.current.account !== options.accountId) memory.current = { account: options.accountId, positions: new Map(), origin: null };
  const entry = useRef<Entry | null>(null), previousEnabled = useRef(options.enabled), carryReading = useRef(false);
  const animation = useRef<Animation | null>(null), focusFrame = useRef(0), generation = useRef(0);
  const stop = useCallback(() => { const current = animation.current; animation.current = null; current?.cancel(); }, []);
  const cancelFocus = useCallback(() => { cancelAnimationFrame(focusFrame.current); focusFrame.current = 0; }, []);
  const rememberOpen = useCallback((opener?: HTMLElement | null) => {
    const current = latest.current, panel = current.listPanel.current, list = current.list.current;
    if (!current.enabled || !current.active || !current.accountId || !panel || !list) return;
    const target = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    memory.current.origin = { top: list.scrollTop, left: list.scrollLeft, opener: target && panel.contains(target) ? target : null, panel };
  }, []);
  const savePosition = useCallback((acceptGeometry = false) => {
    const current = latest.current, node = current.scroller.current, state = entry.current;
    if (!current.enabled || !current.active || !current.accountId || !state || state.account !== current.accountId || state.id !== current.conversationId || !state.presented || !available(node) || node.clientHeight <= 0) return;
    const positions = memory.current.positions, saved = positions.get(state.id);
    if (saved && keyboardOwns(current, node) && !state.userScroll) return;
    // Native anchoring/resize scroll events must not replace the custom anchor
    // before its ResizeObserver compensation has had a chance to run.
    if (!acceptGeometry && saved && geometryChanged(node, saved)) return;
    positions.delete(state.id); positions.set(state.id, readPosition(node));
    const oldest = positions.keys().next().value; if (positions.size > 50 && oldest !== undefined) positions.delete(oldest);
  }, []);

  useLayoutEffect(() => {
    const current = latest.current, was = entry.current;
    const lifetime = generation, scope = ++lifetime.current;
    stop(); cancelFocus();
    carryReading.current = !previousEnabled.current && current.enabled;
    previousEnabled.current = current.enabled;
    if (!current.enabled || !current.active || !current.accountId) { entry.current = null; return; }
    if (!current.conversationId) {
      entry.current = null;
      const origin = memory.current.origin, list = current.list.current;
      if (!was || !origin || !list) return;
      list.scrollTop = origin.top; list.scrollLeft = origin.left;
      const leavingFocus = document.activeElement;
      focusFrame.current = requestAnimationFrame(() => {
        focusFrame.current = 0;
        const next = latest.current;
        if (generation.current !== scope || !next.enabled || !next.active || next.accountId !== current.accountId || next.conversationId || memory.current.origin !== origin || !available(origin.panel)) return;
        const focused = document.activeElement;
        if (focused !== document.body && focused !== leavingFocus && !current.threadPanel.current?.contains(focused)) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        const target = available(origin.opener) ? origin.opener : origin.panel;
        const rect = target.getBoundingClientRect(), bounds = list.getBoundingClientRect();
        const visible = target === origin.panel || (rect.bottom > bounds.top && rect.top < bounds.bottom);
        (visible ? target : origin.panel).focus({ preventScroll: true });
      });
      return () => { cancelFocus(); if (lifetime.current === scope) lifetime.current++; };
    }
    current.preserveScrollRef.current = false;
    current.isAtBottomRef.current = false;
    const node = current.scroller.current, previousAnchor = node?.style.overflowAnchor ?? '';
    if (node) node.style.overflowAnchor = 'none';
    entry.current = { id: current.conversationId, account: current.accountId, loading: current.isLoadingThread && current.messages.length === 0, presented: false, interrupted: false, userScroll: false, userGeometry: null, ids: new Set(), lastId: null, count: 0 };
    return () => { savePosition(); stop(); cancelFocus(); if (node) node.style.overflowAnchor = previousAnchor; if (lifetime.current === scope) lifetime.current++; };
  }, [options.enabled, options.active, options.accountId, options.conversationId, cancelFocus, savePosition, stop]);

  useLayoutEffect(() => {
    const current = latest.current, state = entry.current, node = current.scroller.current;
    if (!current.enabled || !current.active || !current.accountId || !state || state.id !== current.conversationId || !node) return;
    if (current.isLoadingThread && current.messages.length === 0) return;
    const last = current.messages[current.messages.length - 1];
    if (!state.presented) {
      const saved = memory.current.positions.get(state.id);
      if (!state.interrupted && !current.preserveScrollRef.current) {
        if (saved) restorePosition(node, saved);
        else if (!carryReading.current) node.scrollTop = node.scrollHeight;
      }
      current.isAtBottomRef.current = atBottom(node); current.setHasNewBelow(false); state.presented = true;
      const focused = document.activeElement, panel = current.threadPanel.current;
      if (!state.interrupted && available(panel) && (focused === document.body || current.listPanel.current?.contains(focused) || panel.contains(focused)) && !(focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"]'))) panel.focus({ preventScroll: true });
      const duration = state.loading && !state.interrupted ? motionMs('fast') : 0;
      if (duration && typeof node.animate === 'function') {
        try {
          const reveal = node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: motionEase() }); animation.current = reveal;
          const done = () => { if (animation.current === reveal) { animation.current = null; reveal.cancel(); } };
          void reveal.finished.then(done, done);
        } catch { stop(); }
      }
    } else if (current.preserveScrollRef.current) {
      // Earlier pages keep the most recently read anchor, including a user
      // scroll made while the request was pending, rather than its old height.
      const saved = memory.current.positions.get(state.id); if (saved) restorePosition(node, saved);
    } else {
      const added = last && last.id !== state.lastId && !state.ids.has(last.id) && (current.messages.length > state.count || current.messages.some(message => message.id === state.lastId));
      if (added) {
        if (current.isAtBottomRef.current || (last.senderProfileId !== null && last.senderProfileId === current.viewerProfileId)) {
          node.scrollTop = node.scrollHeight; current.isAtBottomRef.current = true; current.setHasNewBelow(false);
        } else current.setHasNewBelow(true);
      } else if (!current.isAtBottomRef.current && !keyboardOwns(current, node)) {
        const saved = memory.current.positions.get(state.id); if (saved) restorePosition(node, saved, true);
      }
    }
    state.lastId = last?.id ?? null; state.count = current.messages.length; state.ids = new Set(current.messages.map(message => message.id));
    if (current.isAtBottomRef.current) current.markRead();
    savePosition(true);
  }, [options.enabled, options.active, options.accountId, options.conversationId, options.messages, options.isLoadingThread, options.viewerProfileId, savePosition, stop]);

  useEffect(() => {
    if (!options.enabled || !options.active || !options.accountId) return;
    const lifetime = generation, scope = lifetime.current, node = scrollerRef.current;
    const scroll = () => {
      const current = latest.current;
      if (generation.current !== scope || !current.enabled || !current.active) return;
      const state = entry.current;
      if (state?.userScroll && (state.userGeometry?.height !== node?.clientHeight || state.userGeometry?.extent !== node?.scrollHeight)) state.userScroll = false;
      savePosition(state?.userScroll === true);
    };
    const interrupt = (event: Event) => {
      if (generation.current !== scope) return;
      if (entry.current) {
        entry.current.interrupted = true;
        entry.current.userScroll = event.type !== 'popstate' && event.target instanceof HTMLElement && Boolean(node?.contains(event.target)) && !event.target.matches('input, textarea, select, [contenteditable="true"]');
        entry.current.userGeometry = entry.current.userScroll && node ? { height: node.clientHeight, extent: node.scrollHeight } : null;
      }
      savePosition(); stop(); cancelFocus();
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if (generation.current === scope && reducedMotion()) stop(); };
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, interrupt, { capture: true, passive: true });
    window.addEventListener('popstate', interrupt); media.addEventListener('change', reduce); node?.addEventListener('scroll', scroll, { passive: true });
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(reduce) : null;
    const preferenceHosts = new Set<Element>([document.documentElement]);
    const viewport = document.querySelector('#app-viewport'); if (viewport) preferenceHosts.add(viewport);
    const reducedHost = document.querySelector('.reduce-motion'); if (reducedHost) preferenceHosts.add(reducedHost);
    for (const host of preferenceHosts) observer?.observe(host, { attributes: true, attributeFilter: ['class'] });
    return () => {
      for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.removeEventListener(type, interrupt, true);
      window.removeEventListener('popstate', interrupt); media.removeEventListener('change', reduce); node?.removeEventListener('scroll', scroll); observer?.disconnect(); if (lifetime.current === scope) { stop(); cancelFocus(); }
    };
  }, [options.enabled, options.active, options.accountId, options.conversationId, scrollerRef, cancelFocus, savePosition, stop]);

  useEffect(() => {
    const node = scrollerRef.current, state = entry.current;
    if (!options.enabled || !options.active || !node || !state?.presented || typeof ResizeObserver !== 'function') return;
    const scope = generation.current;
    const observer = new ResizeObserver(() => {
      const current = latest.current;
      if (generation.current !== scope || !current.enabled || !current.active || current.preserveScrollRef.current || keyboardOwns(current, node)) return;
      const saved = memory.current.positions.get(state.id);
      if (saved?.bottom) node.scrollTop = node.scrollHeight;
      else if (saved) restorePosition(node, saved, true);
      savePosition(true);
    });
    observer.observe(node);
    const content = node.querySelector<HTMLElement>('[data-message-id]')?.closest('ol'); if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [options.enabled, options.active, options.accountId, options.conversationId, options.messages, options.isLoadingThread, scrollerRef, savePosition]);
  return { rememberOpen };
}
