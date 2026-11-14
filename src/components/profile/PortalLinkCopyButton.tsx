import React, { useEffect, useState } from 'react';
import { CheckIcon, LinkIcon } from 'lucide-react';
import { PUBLIC_ORIGIN } from '../../features/citations/publicOrigin';
import { portfolioCategoryPath } from '../../features/sharing/shareModel';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { Button } from '../ui/Button';

export function PortalLinkCopyButton({ profileId, categoryId, compact = false }: {
  profileId: string; categoryId: string; compact?: boolean;
}) {
  const [result, setResult] = useState<'copied' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (result !== 'copied') return;
    const timeout = window.setTimeout(() => setResult(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [result]);

  const copyLink = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      // The stable address resolves to the creator's current public handle.
      // Copy within the tap, without waiting for a network request on Safari.
      const url = new URL(portfolioCategoryPath(profileId, categoryId), PUBLIC_ORIGIN);
      url.searchParams.set('view', 'portal');
      await copyPublicLink(url.href);
      setResult('copied');
    } catch {
      setResult('error');
    } finally {
      setBusy(false);
    }
  };
  const label = result === 'copied' ? 'Copied Portal link' : result === 'error' && !compact ? 'Try again to copy Portal' : 'Copy Portal';
  const message = result === 'copied' ? 'Portal link copied' : result === 'error' ? 'Could not copy the Portal link. Try again.' : '';
  return <>
    <Button aria-label={label}
      title={message || 'Copy Portal'} aria-busy={busy}
      className={compact ? '!gap-0 !px-2.5' : 'whitespace-nowrap !gap-1.5 !px-2.5 !text-xs'}
      style={result === 'copied' ? { '--ui-control-text': 'var(--status-success)' } as React.CSSProperties : undefined}
      icon={result === 'copied' ? CheckIcon : LinkIcon} onClick={() => void copyLink()}>
      {!compact && (result === 'copied' ? 'Copied' : result === 'error' ? 'Try again' : 'Copy Portal')}
    </Button>
    <span className="sr-only" role="status">{message}</span>
  </>;
}
