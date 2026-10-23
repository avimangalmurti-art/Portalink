import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { coverThumbnailSources } from '../../features/media/coverThumbnailSources';
import { resolveSharedContentPreview } from '../../features/messages/sharedContentPreview';
import type { SharedContentPreview, SharedContentTarget } from '../../features/messages/sharedContentPreview';
import './shared-content-message-preview.css';

type PdfPreview = typeof import('../media/PdfPage').PdfPage;

/** Only current-recipient project reads can supply artwork for a stored share. */
export function SharedContentMessagePreview({ target }: { target: SharedContentTarget }) {
  const auth = useAuth();
  const services = useServices();
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(() => ({ userId: auth.user?.id, profileId: auth.viewerProfileId, loginSession: auth.loginSession, services, to: target.to, attempt }), [auth.user?.id, auth.viewerProfileId, auth.loginSession, services, target.to, attempt]);
  const currentScope = useRef<object | null>(scope);
  currentScope.current = scope;
  const hostRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<{ scope: object; preview: SharedContentPreview | null; failed: boolean; PdfPage?: PdfPreview } | null>(null);
  const current = snapshot?.scope === scope ? snapshot : null;

  useEffect(() => {
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSnapshot(null);
    void resolveSharedContentPreview(target, services).then(async preview => {
      if (cancelled || currentScope.current !== scope) return;
      // Catch a disconnected/stale chunk here too, without crashing the thread
      // or caching a rejected React.lazy type that Retry could never recover.
      const PdfPage = preview.kind === 'document' ? (await import('../media/PdfPage')).PdfPage : undefined;
      if (!cancelled && currentScope.current === scope) setSnapshot({ scope, preview, PdfPage, failed: !preview.source && !preview.thumbnail });
    }).catch(() => {
      if (!cancelled && currentScope.current === scope) setSnapshot({ scope, preview: null, failed: true });
    });
    return () => { cancelled = true; };
    // `to` is the complete immutable message destination, including media/page.
  }, [attempt, scope, services, target, visible]);

  const preview = current?.preview;
  const PdfPage = current?.PdfPage;
  const thumbnail = preview?.kind === 'cover' ? coverThumbnailSources(preview.thumbnail) : null;
  const source = thumbnail?.src ?? preview?.source;
  const label = preview ? [preview.title, preview.pageLabel].filter(Boolean).join(' · ') : target.pageNumber ? `Shared page ${target.pageNumber}` : 'Shared project';
  const failed = current?.failed ?? false;
  const fail = () => {
    if (currentScope.current === scope) setSnapshot(previous => previous?.scope === scope ? { ...previous, failed: true } : previous);
  };

  return <div ref={hostRef} className="shared-content-message-preview" data-shared-content-preview="">
    <Link ref={linkRef} to={target.to} aria-label={`Open ${label}`} className="shared-content-message-preview-link">
      <div className="shared-content-message-preview-frame">
        {failed ? <span>Preview unavailable</span> : !preview ? <span role="status">Loading preview…</span> : preview.kind === 'document' && source && PdfPage ?
          <PdfPage key={`${attempt}:${source}`} source={source} pageNumber={preview.pageNumber} strictPageNumber label={label} onRenderFailure={fail} />
          : source ? <img key={`${attempt}:${source}`} src={source} srcSet={thumbnail?.srcSet} sizes="280px" alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} /> : <span>Preview unavailable</span>}
      </div>
      <span className="shared-content-message-preview-caption">{label}</span>
    </Link>
    {failed ? <button type="button" className="shared-content-message-preview-retry" onClick={() => { linkRef.current?.focus({ preventScroll: true }); setSnapshot(null); setAttempt(value => value + 1); }}>Retry preview</button> : null}
  </div>;
}
