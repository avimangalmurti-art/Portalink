import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useViewportPresentation } from '../../presentation/useViewportPresentation';
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
  const [instant, setInstant] = useState(() => hasCompletedCatalogWelcome() || prefersReducedMotion());
  const [elapsed, setElapsed] = useState(() => instant ? CATALOG_WELCOME_MS : 0);
  const [portalHost] = useState(() => document.fullscreenElement ?? document.body);
  const viewport = useDialogViewport<HTMLElement>();
  const presentation = useViewportPresentation();
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
    if (!finished.current || !onDismiss) finish();
    else onDismiss();
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

  const screen = <section ref={viewport} className="catalog-welcome" data-presentation={presentation} role="dialog" aria-modal="true" tabIndex={-1}
    aria-labelledby={progress.complete ? undefined : 'catalog-welcome-title'} aria-label={progress.complete ? 'Create catalogue' : undefined}
    data-complete={progress.complete} data-instant={instant} data-map-revealed={progress.textComplete}
    onPointerDownCapture={() => { skipGesture.current = !finished.current; }}
    onPointerCancelCapture={() => { skipGesture.current = false; }}
    onClickCapture={event => {
      if (skipGesture.current || !finished.current) {
        skipGesture.current = false;
        event.preventDefault(); event.stopPropagation(); finish();
      }
    }}
    onKeyDownCapture={event => {
      skipGesture.current = false;
      if (!finished.current && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
        event.preventDefault(); event.stopPropagation(); finish();
      }
    }}>
    <div className="catalog-welcome-map" aria-hidden="true" />
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
