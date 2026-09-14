import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { FeatureCardApp } from './FeatureCard';
type Game = {
  name: string;
  subtitle: string;
  icon: string;
};
type CuratedGamesPanelProps = {
  games: Game[];
  className?: string;
  onProfile: (account: FeatureCardApp) => void;
};
type ScrollState = {
  isScrollable: boolean;
  scrollTop: number;
  thumbHeight: number;
  thumbTop: number;
  viewportHeight: number;
};
const GAME_ROW_HEIGHT = 64;
const initialScrollState: ScrollState = {
  isScrollable: false,
  scrollTop: 0,
  thumbHeight: 100,
  thumbTop: 0,
  viewportHeight: 0
};
export function CuratedGamesPanel({
  games,
  className = '',
  onProfile
}: CuratedGamesPanelProps) {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>(initialScrollState);
  const shouldReduceMotion = useReducedMotion();
  useEffect(() => {
    const scrollViewport = scrollViewportRef.current;
    if (!scrollViewport) {
      return undefined;
    }
    function updateScrollState() {
      if (scrollViewport) {
        updateScrollPosition(scrollViewport, setScrollState);
      }
    }
    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(scrollViewport);
    window.addEventListener('resize', updateScrollState);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [games]);
  return <section aria-labelledby="essential-games-title" className={`card-surface shape-container flex min-h-0 flex-col overflow-hidden px-4 py-4 shadow-sm ring-1 ring-[var(--hairline)] transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-within:-translate-y-0.5 motion-reduce:transition-none ${className}`}>
      <header className="shrink-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Essentials</p>
        <h2 id="essential-games-title" className="mt-1 truncate text-[19px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">Popular Creative Collectives</h2>
      </header>

      <div className="relative mt-3.5 min-h-0 flex-1 overflow-hidden">
        <div ref={scrollViewportRef} onScroll={(event) => updateScrollPosition(event.currentTarget, setScrollState)} tabIndex={0} className="scrollbar-hidden flex h-full flex-col gap-1.5 overflow-y-auto overscroll-contain pr-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" role="list" aria-label="Essential iPhone Games">
          {games.map((game, index) => {
          const openAccount = () => onProfile({
            name: game.name,
            tagline: game.subtitle,
            icon: game.icon
          });
          return <article key={game.name} className="shape-concentric group relative flex min-h-[64px] shrink-0 items-center gap-2.5 overflow-hidden px-2 py-1.5 transition-[transform,filter,opacity] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:brightness-95 focus-within:-translate-y-0.5 focus-within:brightness-95 motion-reduce:transition-none" role="listitem" style={getRowScrollStyle(index, scrollState, Boolean(shouldReduceMotion))}>
              <button type="button" onClick={openAccount} aria-label={`Open ${game.name}'s account`} className="absolute inset-0 z-0 rounded-[inherit] focus:outline-none" />
              <div aria-hidden="true" className="pointer-events-none relative z-10 shape-concentric h-11 w-11 shrink-0 bg-[var(--surface-sunken)] ring-1 ring-[var(--hairline)]" />
              <div className="pointer-events-none relative z-10 min-w-0 flex-1">
                <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.25] text-[var(--text-primary)]">{game.name}</h3>
              </div>
              <button type="button" onClick={openAccount} aria-label={`Open ${game.name}'s account`} style={{
              color: 'var(--accent-text)',
              backgroundColor: 'var(--accent-soft)'
            }} className="relative z-20 shape-capsule shrink-0 px-3.5 py-1 text-[12px] font-semibold transition-[transform,background-color] duration-180 ease-out hover:-translate-y-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">View</button>
            </article>;
        })}
        </div>

        <div aria-hidden="true" className={`pointer-events-none absolute bottom-1 right-0 top-1 z-20 w-1.5 rounded-full bg-[var(--surface-sunken)] transition-opacity duration-200 ${scrollState.isScrollable ? 'opacity-100' : 'opacity-0'}`}>
          <span className="absolute inset-x-0 min-h-8 rounded-full bg-[var(--text-tertiary)] shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-[top,height] duration-150 ease-out motion-reduce:transition-none" style={{
          height: `${scrollState.thumbHeight}%`,
          top: `${scrollState.thumbTop}%`
        }} />
        </div>
      </div>
    </section>;
}
function getRowScrollStyle(index: number, scrollState: ScrollState, shouldReduceMotion: boolean): React.CSSProperties | undefined {
  if (shouldReduceMotion || !scrollState.isScrollable || scrollState.viewportHeight === 0) {
    return undefined;
  }
  const rowTop = index * GAME_ROW_HEIGHT - scrollState.scrollTop;
  const rowBottom = rowTop + GAME_ROW_HEIGHT;
  const clippedAtTop = Math.max(0, -rowTop);
  const clippedAtBottom = Math.max(0, rowBottom - scrollState.viewportHeight);
  const clippedAmount = Math.max(clippedAtTop, clippedAtBottom);
  const clippedProgress = Math.min(1, clippedAmount / GAME_ROW_HEIGHT);
  return {
    opacity: 1 - Math.pow(clippedProgress, 0.72) * 0.82
  };
}
function updateScrollPosition(scrollViewport: HTMLDivElement, setScrollState: React.Dispatch<React.SetStateAction<ScrollState>>) {
  const {
    clientHeight,
    scrollHeight,
    scrollTop
  } = scrollViewport;
  const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
  const isScrollable = maxScrollTop > 1;
  const scrollProgress = isScrollable ? scrollTop / maxScrollTop : 0;
  const thumbHeight = isScrollable ? Math.max(14, Math.min(100, clientHeight / scrollHeight * 100)) : 100;
  setScrollState({
    isScrollable,
    scrollTop,
    thumbHeight,
    thumbTop: scrollProgress * (100 - thumbHeight),
    viewportHeight: clientHeight
  });
}
