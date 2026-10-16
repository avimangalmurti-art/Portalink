import React, { useEffect, useRef, useState } from 'react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { ModalPortal } from './ModalPortal';
import { usePresentation } from '../../presentation/usePresentation';

type DeferredSurfaceProps = {
  active: boolean;
  children: React.ReactNode;
  onClose: () => void;
  resetKey?: string;
};

function DeferredSurfaceStatus({ failed = false, onClose }: { failed?: boolean; onClose: () => void }) {
  const isMobile = usePresentation() === 'mobile';
  const dialogRef = useRef<HTMLDivElement>(null);
  const viewportRef = useDialogViewport();
  useModalFocus(true, dialogRef, onClose, true);
  return <ModalPortal>
    <div ref={viewportRef} className="modal-scrim fixed inset-x-0 z-[90] flex items-center justify-center bg-black/50 p-4" style={{ top: 'var(--dialog-viewport-top, 0px)', height: 'var(--dialog-viewport-height, 100dvh)' }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" data-ui-surface="popup" aria-modal="true" aria-label={failed ? 'Unable to open' : 'Opening'} className="w-full max-w-[340px] rounded-[24px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-pop)] outline-none">
        {!failed && <div aria-hidden="true" className="mb-4 grid gap-2"><span className="motion-skeleton block h-3 w-3/4 rounded-full" /><span className="motion-skeleton block h-3 w-1/2 rounded-full" /></div>}
        <p role={failed ? 'alert' : 'status'} className="text-[14px] leading-relaxed">{failed ? 'This screen could not be opened. Check your connection and reload this page to try again.' : 'Opening…'}</p>
        <div className="mt-4 flex items-end justify-end gap-2">
          {failed && isMobile && <img src="/portalink-question-character.png" alt="" aria-hidden="true" width={64} height={72} className="mr-auto h-[72px] w-16 shrink-0 object-contain" />}
          <button type="button" onClick={onClose} data-ui-control="button" data-control-size="md" data-control-variant="secondary" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{failed ? 'Close' : 'Cancel'}</button>
          {failed && <button type="button" onClick={() => window.location.reload()} data-ui-control="button" data-control-size="md" data-control-variant="primary" className="bg-[var(--accent-primary)] text-[var(--accent-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">Reload page</button>}
        </div>
      </div>
    </div>
  </ModalPortal>;
}

/** A rejected chunk stays local; closing never replaces the rest of the app. */
export class DeferredSurfaceBoundary extends React.Component<DeferredSurfaceProps, { failed: boolean; resetKey?: string }> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() { return { failed: true }; }

  static getDerivedStateFromProps(props: DeferredSurfaceProps, state: { resetKey?: string }) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  render() {
    if (this.state.failed) return this.props.active ? <DeferredSurfaceStatus failed onClose={this.props.onClose} /> : null;
    return this.props.children;
  }
}

export function DeferredSurface({ active, children, onClose, resetKey }: DeferredSurfaceProps) {
  return <DeferredSurfaceBoundary active={active} onClose={onClose} resetKey={resetKey}>
    <React.Suspense fallback={active ? <DeferredSurfaceStatus onClose={onClose} /> : null}>{children}</React.Suspense>
  </DeferredSurfaceBoundary>;
}

/** Load on first use, then let the dialog handle its own closing/draft lifecycle. */
export function DeferredDialog({ active, children, onClose }: DeferredSurfaceProps) {
  const [hasOpened, setHasOpened] = useState(active);
  useEffect(() => { if (active) setHasOpened(true); }, [active]);
  return active || hasOpened ? <DeferredSurface active={active} onClose={onClose}>{children}</DeferredSurface> : null;
}
