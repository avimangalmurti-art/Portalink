import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import type { DeleteAccountResult } from '../../types/auth';

export function useDeletionRecovery({ enabled, viewerAccountId, initializing }: {
  enabled: boolean; viewerAccountId: string | null; initializing: boolean;
}) {
  const { auth } = useServices();
  const [target, setTarget] = useState<{ accountId: string; viewerScope: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DeleteAccountResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [none, setNone] = useState(false);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    setTarget(null); setOpen(false); setResult(null); setUnavailable(false); setNone(false);
    pending.current = false; setChecking(false);
    if (!enabled || initializing || !auth.getAccountDeletionRecovery) return;
    void auth.getAccountDeletionRecovery().then(recovery => {
      if (generation.current !== current || !recovery || viewerAccountId && recovery.accountId !== viewerAccountId) return;
      setTarget({ accountId: recovery.accountId, viewerScope: viewerAccountId }); setOpen(true);
    }).catch(() => { /* No receipt can be established; expose no account information. */ });
    return () => { generation.current = current + 1; };
  }, [auth, enabled, initializing, viewerAccountId]);

  const refresh = useCallback(async () => {
    if (!enabled || !target || target.viewerScope !== viewerAccountId || !auth.getAccountDeletionStatus || pending.current) return;
    const current = generation.current;
    pending.current = true; setChecking(true); setUnavailable(false);
    try {
      const outcome = await auth.getAccountDeletionStatus(target.accountId);
      if (generation.current !== current) return;
      setNone(!outcome);
      if (outcome) setResult(previous => previous?.isDeleted ? previous : outcome);
    } catch {
      if (generation.current === current) setUnavailable(true);
    } finally {
      if (generation.current === current) { pending.current = false; setChecking(false); }
    }
  }, [auth, enabled, target, viewerAccountId]);
  useEffect(() => { if (target) void refresh(); }, [target, refresh]);
  return {
    isOpen: enabled && open && Boolean(target && target.viewerScope === viewerAccountId),
    checking, unavailable, none, result, refresh,
    // Closing this surface never cancels a durable job or clears its receipt.
    close: useCallback(() => setOpen(false), []),
  };
}
