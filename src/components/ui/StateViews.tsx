import { projectContinuityStyle } from '../../utils/projectContinuity';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { Button } from './Button';
import { InterfaceIcon } from './InterfaceIcon';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';

/**
 * The shared empty / loading / error views.
 *
 * Every feature that reads from a service should render one of these rather than
 * inventing its own copy and markup, so the states stay consistent once real
 * requests can fail.
 */

export function EmptyState({
  title,
  description,
  action,
  secondaryAction







}: {title: string;description?: string;action?: {label: string;onClick: () => void;};secondaryAction?: {label: string;onClick: () => void;};}) {
  return <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
      <p className="type-title-2 font-medium text-[var(--text-primary)]">{title}</p>
      {description && <p className="type-body mt-1 max-w-[46ch] text-[var(--text-secondary)]">{description}</p>}
      {action && <div className="mt-3">
          <Button variant="secondary" onClick={action.onClick}>{action.label}</Button>
        </div>}
      {secondaryAction && <button type="button" onClick={secondaryAction.onClick} className="mt-2 min-h-[44px] px-3 text-[13px] text-[var(--accent-text)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{secondaryAction.label}</button>}
    </div>;
}

/** Loading geometry describes the destination, never another screen's layout. */
export type LoadingLayout = 'rows' | 'reader' | 'studio' | 'profile' | 'grid' | 'journey' | 'overview' | 'insights' | 'audience' | 'messages' | 'conversation';
type LoadingProps = { label?: string; kind?: LoadingLayout; projectId?: string; columns?: number };
function LoadingShapes({kind, columns = 2}: {kind: LoadingLayout; columns?: number}) {
 const bone = (name: string) => <span className={`motion-skeleton loading-${name}`} />;
 const grid = <div className="loading-project-grid" style={{'--loading-columns': Math.max(1, Math.min(13, Math.floor(columns) || 2))} as React.CSSProperties}>{Array.from({length:8}, (_,i) => <div key={i}>{bone('cover')}{bone('caption')}</div>)}</div>;
 const rows = <div className="loading-item-list">{[0,1,2,3].map(i=><div key={i} className="loading-item-row">{bone(kind==='messages'?'avatar':'thumbnail')}<div>{bone('title')}{bone('subtitle')}{kind!=='messages'&&bone('metadata')}</div></div>)}</div>;
 return <div className="screen-loading-shapes" aria-hidden="true">
  {kind==='profile'?<><div className="loading-profile-identity">{bone('avatar')}<div>{bone('title')}{bone('subtitle')}<div className="loading-inline-tabs">{bone('tab')}{bone('tab')}</div></div></div><div className="loading-profile-counts">{[0,1,2,3].map(i=><span key={i} className="motion-skeleton" />)}</div><div className="loading-profile-links">{[0,1,2].map(i=><span key={i} className="motion-skeleton" />)}</div>{grid}</>
   :kind==='grid'?grid
   :kind==='overview'?<div className="loading-overview">{[0,1,2].map(i=><div key={i}>{bone('title')}{bone('subtitle')}{bone('action')}</div>)}</div>
   :kind==='insights'?<>{bone('headline')}<div className="loading-metric-pills">{[0,1,2].map(i=><span key={i} className="motion-skeleton" />)}</div>{bone('subtitle')}<div className="loading-chart">{[0,1,2,3,4,5,6,7].map(i=><span key={i} className="motion-skeleton"/>)}</div>{rows}</>
   :kind==='audience'?<div className="loading-audience">{[0,1,2].map(i=><div key={i}>{bone('subtitle')}{bone('count')}</div>)}</div>
   :kind==='journey'?<div className="loading-journey">{bone('year')}{[0,1,2].map(i=><div key={i}>{bone('cover')}<div>{bone('date')}{bone('title')}{bone('subtitle')}</div></div>)}</div>
   :kind==='conversation'?<div className="loading-conversation">{[0,1,2,3].map(i=><span key={i} className="motion-skeleton" />)}</div>:rows}
 </div>;
}
export function LoadingSkeleton({label='Loading',kind='rows',projectId,columns}:LoadingProps) {
 if(kind==='reader')return <div role="status" aria-label={label} aria-live="polite" data-reader-frame="" data-premium-project-viewer="" data-mobile-page-reader="" className="motion-reader-skeleton"><span className="motion-skeleton motion-reader-counter"/><div className="motion-reader-page motion-skeleton" data-project-continuity-surface="" data-project-continuity-id={projectId} style={projectId ? projectContinuityStyle(projectId) : undefined}/></div>;
 return <div role="status" aria-label={label} aria-live="polite" data-loading-layout={kind} className={kind==='profile'||kind==='journey'?'motion-profile-skeleton':undefined}>
  <LoadingShapes kind={kind} columns={columns}/>
  <div className="legacy-loading-shapes" aria-hidden="true">{(kind==='profile'||kind==='journey')&&<div className="motion-profile-identity motion-skeleton"/>}<div className="motion-list-skeleton">{[0,1,2,3].map(i=><span key={i} className="motion-skeleton"/>)}</div></div>
 </div>;
}
export function LoadingState(props:LoadingProps) {return <LoadingSkeleton {...props}/>;}

/** Use the same spinner while opening either a project route or its first page. */
export function ProjectOpeningLoader({ label = 'Opening project' }: { label?: string } = {}) {
  const active = useMobileScreenActive();
  const loader = useRef<HTMLDivElement>(null);
  const [shell, setShell] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (active && !shell) setShell(loader.current?.closest<HTMLElement>('.app-shell') ?? null);
  }, [active, shell]);
  if (!active) return null;
  const indicator = <div ref={loader} data-project-opening-loader="" role="status" aria-live="polite" aria-label={label}>
    <span className="premium-media-loading-mark" aria-hidden="true" />
  </div>;
  return shell ? createPortal(indicator, shell) : indicator;
}

/** Failure is never colour-only: it carries an icon, a message, and a way out. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry




}: {title?: string;description?: string;onRetry?: () => void;}) {
  return <div role="alert" className="flex min-h-[200px] flex-col items-center justify-center rounded-[12px] border border-[var(--hairline-strong)] px-6 py-8 text-center">
      <InterfaceIcon icon={AlertTriangleIcon} renderingMode="hierarchical" className="text-[var(--text-secondary)]" />
      <p className="type-title-2 mt-2 font-semibold text-[var(--text-primary)]">{title}</p>
      {description && <p className="type-body mt-1 max-w-[46ch] text-[var(--text-secondary)]">{description}</p>}
      {onRetry && <div className="mt-3">
          <Button variant="secondary" onClick={onRetry}>Try again</Button>
        </div>}
    </div>;
}

/** Inline counterpart for actions inside a toolbar or row. */
export function InlineStatus({
  status,
  message,
  onRetry




}: {status: 'idle' | 'loading' | 'success' | 'error';message?: string;onRetry?: () => void;}) {
  if (status === 'idle') {
    return null;
  }
  return <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[12px]">
      {status === 'loading' && <InterfaceIcon icon={Loader2Icon} size="xs" effect="rotate" effectActive className="text-[var(--text-tertiary)]" />}
      <span className={status === 'error' ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
        {message ?? (status === 'loading' ? 'Working…' : status === 'success' ? 'Done' : 'Failed')}
      </span>
      {status === 'error' && onRetry && <button type="button" onClick={onRetry} className="font-semibold text-[var(--accent-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          Retry
        </button>}
    </span>;
}
