import React, { useRef, useState } from 'react';
import { AlertTriangleIcon, FilmIcon, FolderOpenIcon, InfoIcon, ZapIcon } from 'lucide-react';
import type { StudioActionKey } from '../../utils/studioQuery';
import type { GenerationState } from '../../features/studio/useStudioGeneration';
type ActionState = 'idle' | 'loading';

/**
 * Studio's generative actions, surfaced only when the current finding calls for
 * one.
 *
 * Purely presentational: it calls no service. Each button used to run a local
 * timer and then report "Layout revision drafted" — a success state for work that
 * was never requested. It now renders the lifecycle `useStudioGeneration` owns,
 * including the service's own account of what actually happened.
 */
export function ContextualAction({
  action,
  generation



}: {action: StudioActionKey;generation: GenerationState;}) {
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  if (!action) {
    return null;
  }
  const isThisAction = generation.activeAction === action;
  const isRunning = isThisAction && generation.phase === 'running';
  const outcome = isThisAction && generation.phase === 'reported' ? generation.outcome : null;
  const failure = isThisAction && generation.phase === 'error' ? generation.error : null;
  // Stated before the action is taken, so the control never implies output it
  // cannot produce. A capability that could not be read promises nothing either.
  const unavailableReason = generation.capabilityError ?? (generation.capability && !generation.capability.isAvailable ? generation.capability.reason ?? 'Generation is not available.' : null);
  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setDroppedFiles(Array.from(files));
  }
  // AI interpretation carries a barely-there indigo tint and edge, never a fill.
  return <section aria-label="AI finding and action" className="rounded-[10px] border-l-2 border-y border-r border-y-[var(--studio-hairline)] border-r-[var(--studio-hairline)] p-3" style={{
    backgroundColor: 'var(--studio-indigo-soft)',
    borderLeftColor: 'var(--studio-indigo)'
  }}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--studio-text-tertiary)]">
        {/* Orange identifies the diagnostic condition, not the button. */}
        {action === 'layout-revision' && <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
        backgroundColor: 'var(--studio-warning)'
      }} />}
        {action === 'simulate-draft' && <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
        backgroundColor: 'var(--studio-pending)'
      }} />}
        {action === 'synthesize' && <span aria-hidden="true" data-keep-color="" className="h-1.5 w-1.5 rounded-full" style={{
        backgroundColor: 'var(--studio-affinity)'
      }} />}
        AI finding
      </p>

      {action === 'layout-revision' && <>
          <p className="mt-1 text-[12px] leading-[1.5] text-[var(--studio-text-muted)]">Sharp retention decline at page 21. I can auto-generate an interleaved visual blueprint for pages 22–40, converting dense text blocks into structural schematics.</p>
          <div className="mt-2.5">
            <StudioButton tone="accent" state={isRunning ? 'loading' : 'idle'} icon={ZapIcon} label="Generate Layout Revision" onClick={() => generation.requestLayoutRevision('harbour-house')} />
          </div>
        </>}

      {action === 'simulate-draft' && <>
          <p className="mt-1 text-[12px] leading-[1.5] text-[var(--studio-text-muted)]">No published Gaze Time baseline yet. Publish work to establish a baseline; draft analysis will appear when it becomes available.</p>
          {/* A real drop target: pointer, keyboard, and file picker all work. */}
          <button type="button" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        acceptFiles(event.dataTransfer.files);
      }} className="mt-2.5 flex min-h-[64px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[9px] border border-dashed px-3 py-2.5 text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]" style={{
        borderColor: isDragging ? 'var(--studio-accent)' : 'var(--studio-hairline-strong)',
        backgroundColor: isDragging ? 'var(--studio-accent-soft)' : 'var(--studio-panel-b)'
      }}>
            <FolderOpenIcon className="h-4 w-4 text-[var(--studio-text-muted)]" aria-hidden="true" />
            <span className="text-[12px] font-medium text-[var(--studio-text)]">Simulate Draft Performance</span>
            <span className="text-[11px] text-[var(--studio-text-tertiary)]">Drop draft files, or click to choose</span>
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" aria-hidden="true" tabIndex={-1} onChange={(event) => acceptFiles(event.target.files)} />
          {droppedFiles.length > 0 && <>
              {/* "Chosen", not "queued": nothing is uploaded and no job exists. */}
              <p aria-live="polite" className="mt-2 text-[11px] text-[var(--studio-text-muted)]">
                <span className="font-semibold text-[var(--studio-text)]">{droppedFiles.length} draft{droppedFiles.length === 1 ? '' : 's'} chosen</span>
                {` — ${droppedFiles.map((file) => file.name).join(', ')}`}
              </p>
              <div className="mt-2">
                <StudioButton tone="accent" state={isRunning ? 'loading' : 'idle'} icon={ZapIcon} label="Simulate performance" onClick={() => generation.simulateDraft(droppedFiles)} />
              </div>
            </>}
        </>}

      {action === 'synthesize' && <>
          <p className="mt-1 text-[12px] leading-[1.5] text-[var(--studio-text-muted)]">Brutalist Type Study and Soundcloud Stats show meaningful audience overlap. I can synthesize them into a video trailer layout.</p>
          <div className="mt-2.5">
            <StudioButton tone="indigo" state={isRunning ? 'loading' : 'idle'} icon={FilmIcon} label="Synthesize Media Cross-Over" onClick={() => generation.synthesizeCrossMedia(['brutalist-type-study', 'soundcloud-stats'])} />
          </div>
        </>}

      {/* Said before anything is pressed. */}
      {unavailableReason && !outcome && !failure && <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-[1.5] text-[var(--studio-text-tertiary)]">
          <InfoIcon className="mt-[2px] h-3 w-3 shrink-0" aria-hidden="true" />
          {unavailableReason}
        </p>}

      {/* The service's own account of what happened. A prototype reports that
         nothing was generated rather than showing a success state. */}
      {outcome && <p role="status" className="mt-2.5 flex items-start gap-1.5 rounded-[8px] border border-[var(--studio-hairline-strong)] bg-[var(--studio-panel-b)] px-2.5 py-2 text-[11px] leading-[1.5] text-[var(--studio-text-muted)]">
          <InfoIcon className="mt-[2px] h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {outcome.message}
            <button type="button" onClick={generation.dismiss} className="ml-1.5 font-semibold text-[var(--studio-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">Dismiss</button>
          </span>
        </p>}

      {failure && <p role="alert" className="mt-2.5 flex items-start gap-1.5 rounded-[8px] border border-[var(--studio-hairline-strong)] px-2.5 py-2 text-[11px] leading-[1.5] text-[var(--studio-text-muted)]">
          <AlertTriangleIcon className="mt-[2px] h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            {failure}
            {generation.retry && <button type="button" onClick={generation.retry} className="ml-1.5 font-semibold text-[var(--studio-text)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">Try again</button>}
          </span>
        </p>}
    </section>;
}

/** One button family: same height, geometry, and state grammar, two tones. */
function StudioButton({
  tone,
  state,
  icon: Icon,
  label,
  onClick






}: {tone: 'accent' | 'indigo';state: ActionState;icon: typeof ZapIcon;label: string;onClick: () => void;}) {
  /**
   * There is no "done" tone any more. The button resolving to green with a tick
   * was the strongest claim in Studio that generation had succeeded, and it was
   * driven by a timer. The outcome is now reported in text by the service.
   */
  const base = tone === 'accent' ? 'var(--studio-accent)' : 'var(--studio-indigo)';
  const hover = tone === 'accent' ? 'var(--studio-accent-hover)' : 'var(--studio-indigo-hover)';
  const isBusy = state === 'loading';
  return <button type="button" onClick={onClick} disabled={isBusy} aria-busy={isBusy} data-keep-color="" onMouseEnter={(event) => {
    if (!isBusy) {
      event.currentTarget.style.backgroundColor = hover;
    }
  }} onMouseLeave={(event) => {
    event.currentTarget.style.backgroundColor = base;
  }} className="flex h-9 w-full items-center justify-center gap-2 rounded-[9px] text-[12px] font-semibold text-[var(--studio-accent-foreground)] transition-colors duration-150 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]" style={{
    backgroundColor: base,
    opacity: isBusy ? 0.72 : 1
  }}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {isBusy ? 'Working…' : label}
    </button>;
}
