import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Pause, Play } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';
import { WelcomeWorld } from './WelcomeWorld';
import { addWorldIdea, worldPointAt, type WorldIdea } from './welcomeWorldModel';
import {
  CATALOG_HEADLINE, CATALOG_SUPPORT, CATALOG_WELCOME_MS,
  catalogWelcomeProgress, hasCompletedCatalogWelcome,
  rememberCatalogWelcomeCompletion, rememberCatalogWelcomeEntry,
} from './catalogWelcomeState';
import './catalog-welcome.css';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The invisible characters occupy their final space throughout the reveal. */
function TypedLines({ lines, count, cursor }: { lines: readonly string[]; count: number; cursor: boolean }) {
  let offset = 0;
  return <span aria-hidden="true">{lines.map(line => {
    const start = offset;
    offset += Array.from(line).length;
    return <span className="catalog-welcome-line" data-started={count > start} data-finished={count >= offset} key={line}><span className="catalog-welcome-line-ink">{Array.from(line).map((character, index) => {
      const position = start + index;
      const insertion = cursor && position === Math.max(0, count - 1);
      return <span className="catalog-welcome-glyph" data-revealed={position < count} key={index}>
        {character}{insertion && <span className="catalog-welcome-cursor" data-before={count === 0} />}
      </span>;
    })}</span></span>;
  })}</span>;
}

/** One accumulating composition, followed by the existing account entry. */
export function CatalogWelcome({ onStart, onDismiss }: { onStart: () => void; onDismiss?: () => void }) {
  const [paused, setPaused] = useState(false);
  const [instant, setInstant] = useState(() => hasCompletedCatalogWelcome() || prefersReducedMotion());
  const [elapsed, setElapsed] = useState(() => instant ? CATALOG_WELCOME_MS : 0);
  const [portalHost] = useState(() => document.fullscreenElement ?? document.body);
  const viewport = useDialogViewport<HTMLElement>();
  const presentation = useViewportPresentation();
  const track = useRef<HTMLDivElement>(null);
  const [ideas, setIdeas] = useState<WorldIdea[]>([]);
  const nextIdea = useRef(0);
  const finished = useRef(instant);
  const started = useRef(false);
  const skipGesture = useRef(false);
  const progress = catalogWelcomeProgress(elapsed);

  const finish = useCallback(() => {
    finished.current = true;
    rememberCatalogWelcomeCompletion();
    setInstant(true);
    setElapsed(CATALOG_WELCOME_MS);
  }, []);
  useModalFocus(true, viewport, () => {
    if (onDismiss) onDismiss();
    else finish();
  });

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { if (preference.matches) finish(); };
    if (preference.matches) finish();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, [finish]);

  useEffect(() => {
    if (instant) { rememberCatalogWelcomeCompletion(); return; }
    const start = performance.now();
    let timer = 0;
    const tick = () => {
      if (finished.current) return;
      const next = Math.min(CATALOG_WELCOME_MS, performance.now() - start);
      setElapsed(next);
      if (next >= CATALOG_WELCOME_MS) {
        finished.current = true;
        rememberCatalogWelcomeCompletion();
      } else timer = window.setTimeout(tick, 40);
    };
    timer = window.setTimeout(tick, 40);
    return () => window.clearTimeout(timer);
  }, [instant]);

  const start = () => {
    if (!finished.current || started.current) return;
    started.current = true;
    rememberCatalogWelcomeEntry();
    onStart();
  };

  const imagine = (x: number, y: number) => {
    const bounds = track.current?.getBoundingClientRect?.();
    if (!bounds) return;
    const point = worldPointAt({ x, y }, bounds);
    if (point) {
      const idea = { ...point, id: ++nextIdea.current };
      setIdeas(previous => addWorldIdea(previous, idea));
    }
  };

  const screen = <section ref={viewport} className="catalog-welcome" data-presentation={presentation} role="dialog" aria-modal="true" tabIndex={-1}
    aria-labelledby={progress.complete ? undefined : 'catalog-welcome-title'} aria-label={progress.complete ? 'Create catalogue' : undefined}
    aria-describedby={progress.complete ? 'catalog-welcome-world-help' : undefined}
    data-complete={progress.complete} data-instant={instant} data-map-revealed={progress.textComplete} data-world-paused={paused}
    onPointerDownCapture={() => { skipGesture.current = !finished.current; }}
    onPointerCancelCapture={() => { skipGesture.current = false; }}
    onClickCapture={event => {
      if ((event.target as Element | null)?.closest?.('[data-welcome-controls]')?.hasAttribute?.('data-welcome-controls')) { skipGesture.current = false; return; }
      if (skipGesture.current || !finished.current) {
        skipGesture.current = false;
        event.preventDefault(); event.stopPropagation(); finish();
      } else {
        const target = event.target as Element | null;
        if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
          && !target?.closest?.('button, a, input, select, textarea, [role="button"]')) imagine(event.clientX, event.clientY);
      }
    }}
    onKeyDownCapture={event => {
      if ((event.target as Element | null)?.closest?.('[data-welcome-controls]')?.hasAttribute?.('data-welcome-controls')) return;
      if (event.key === 'Escape' && onDismiss) { event.preventDefault(); event.stopPropagation(); onDismiss(); return; }
      skipGesture.current = false;
      if (!finished.current && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation(); finish();
      } else if (finished.current && event.key === ' ' && event.target === event.currentTarget) {
        event.preventDefault();
        const bounds = viewport.current?.getBoundingClientRect?.();
        if (bounds) imagine(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      }
    }}>
    <WelcomeWorld trackRef={track} ideas={ideas} />
    {onDismiss && <nav className="catalog-welcome-controls" data-welcome-controls="" aria-label="About Portalink controls">
      <button type="button" data-ui-shape="action" onClick={onDismiss}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
      {progress.textComplete && <button className="catalog-welcome-playback" type="button" data-ui-shape="action" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume animation' : 'Pause animation'}>
        {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{paused ? 'Play' : 'Pause'}
      </button>}
    </nav>}
    {progress.complete && <span id="catalog-welcome-world-help" className="catalog-welcome-accessible">Portals connect human ideas that change the world. Tap the world or press Space to see an idea connect. Create catalogue to begin.</span>}
    <div className="catalog-welcome-layout">
      <div className="catalog-welcome-copy" aria-hidden={progress.complete || undefined}>
        <h1 id="catalog-welcome-title" className="catalog-welcome-headline">
          <span className="catalog-welcome-accessible">{CATALOG_HEADLINE.join(' ')}</span>
          <TypedLines lines={CATALOG_HEADLINE} count={progress.headline} cursor={!progress.supporting && !progress.complete} />
        </h1>
        <p className="catalog-welcome-support">
          <span className="catalog-welcome-accessible">{CATALOG_SUPPORT.join(' ')}</span>
          <TypedLines lines={CATALOG_SUPPORT} count={progress.support} cursor={progress.supporting && !progress.textComplete} />
        </p>
      </div>
      <div className="catalog-welcome-action" data-ready={progress.textComplete} aria-hidden={!progress.complete || undefined}>
        <button className="catalog-welcome-start" type="button" data-ui-shape="action" data-keep-color="" disabled={!progress.complete} tabIndex={progress.complete ? 0 : -1} onClick={start}>
          <span className="catalog-welcome-start-label">Create catalogue</span>
        </button>
      </div>
    </div>
  </section>;
  // Keep one host for this screen's focus/viewport ownership, including fullscreen exit.
  return createPortal(screen, portalHost);
}
