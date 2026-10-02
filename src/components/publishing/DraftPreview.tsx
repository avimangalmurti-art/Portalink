import { FormattedText } from '../text/FormattedText';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import React, { useMemo, useRef, useState } from 'react';
import { CheckIcon, FileIcon, PencilIcon, RotateCcwIcon } from 'lucide-react';
import { formatFileSize } from '../../features/publishing/mediaRules';
import { canBeCover, processingLabel } from '../../features/publishing/assetTypes';
import type { MediaPreparation } from '../../features/publishing/useMediaPreparation';
import type { DraftMetadata } from '../../types/publishing';
import { ProjectCover } from '../media/ProjectCover';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import type { ProjectCoverFrame } from '../../types/domain';
import {
  DEFAULT_PROJECT_COVER_FRAME,
  isDefaultProjectCoverFrame,
  MAX_PROJECT_COVER_ZOOM,
  MIN_PROJECT_COVER_ZOOM,
  normalizeProjectCoverFrame,
} from '../../utils/coverFrame';

/**
 * How the work will read once published, using the card language the profile
 * grid already uses — cover, title, then the category it belongs to — followed
 * by the assets in the order a visitor will move through them.
 *
 * Marked as a draft throughout, so a local preview is never mistaken for
 * published content.
 */
type DraftPreviewProps = {
  metadata: DraftMetadata;
  categoryLabel: string;
  media: MediaPreparation;
  disabled?: boolean;
};
export function DraftPreview({
  metadata,
  categoryLabel,
  media,
  disabled = false
}: DraftPreviewProps) {
  const [isEditingCover, setIsEditingCover] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    width: number;
    height: number;
    frame: ProjectCoverFrame;
  } | null>(null);
  const cover = media.cover;
  const coverFrame = normalizeProjectCoverFrame(cover?.metadata?.coverFrame);
  const coverKind = cover?.family === 'document' ? 'document' : cover?.family === 'video' ? 'video' : undefined;
  const coverChoices = useMemo(() => media.items.filter((item) => canBeCover(item.family, item.capability)), [media.items]);
  const totalBytes = media.items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const updateCoverFrame = (next: ProjectCoverFrame) => {
    if (!cover || disabled) {
      return;
    }
    media.setCoverFrame(cover.id, normalizeProjectCoverFrame(next));
  };
  return <div className="flex flex-col gap-3">
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Draft preview</p>
      {/* The card keeps its own scale; the asset order reads beside it. */}
      <div className="grid grid-cols-1 items-start gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <article aria-label={`Draft preview of ${metadata.title.trim()}`} className="overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-inset)]">
        <div
          role={isEditingCover ? 'group' : undefined}
          aria-label={isEditingCover ? 'Cover positioning area. Drag the artwork or use the arrow keys to choose the visible area.' : undefined}
          tabIndex={isEditingCover && cover?.previewUrl && !disabled ? 0 : undefined}
          onPointerDown={(event) => {
            if (
              !isEditingCover
              || !cover?.previewUrl
              || disabled
              || event.button !== 0
              || (event.target instanceof Element && Boolean(event.target.closest('button, input')))
            ) {
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            dragRef.current = {
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              width: Math.max(1, bounds.width),
              height: Math.max(1, bounds.height),
              frame: coverFrame,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) {
              return;
            }
            updateCoverFrame({
              ...drag.frame,
              x: drag.frame.x - (event.clientX - drag.startClientX) / (drag.width * drag.frame.zoom),
              y: drag.frame.y - (event.clientY - drag.startClientY) / (drag.height * drag.frame.zoom),
            });
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) {
              dragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onKeyDown={(event) => {
            if (!isEditingCover || disabled) {
              return;
            }
            const step = event.shiftKey ? 0.05 : 0.015;
            const offsets: Partial<Record<typeof event.key, [number, number]>> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const offset = offsets[event.key];
            if (!offset) {
              return;
            }
            event.preventDefault();
            updateCoverFrame({
              ...coverFrame,
              x: coverFrame.x + offset[0],
              y: coverFrame.y + offset[1],
            });
          }}
          className={`group/cover-preview relative aspect-[4/3] w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${isEditingCover && cover?.previewUrl && !disabled ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
        >
          {cover?.previewUrl ? <ProjectCover source={cover.previewUrl} alt={`Local preview of ${cover.fileName}`} kind={coverKind} frame={coverFrame} pageNumber={cover.metadata?.coverPageNumber} aspectRatio={cover.metadata?.widthPixels && cover.metadata.heightPixels ? cover.metadata.widthPixels / cover.metadata.heightPixels : 4 / 3} sizes="320px" priority /> : <div aria-hidden="true" className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <FileIcon className="h-6 w-6" />
              {cover && <span className="px-4 text-center text-[12px] leading-relaxed">No cover preview is available for this {cover.typeLabel.toLowerCase()} file</span>}
            </div>}
          {isEditingCover && cover?.previewUrl ? <span aria-hidden="true" className="pointer-events-none absolute left-2 top-2 shape-compact bg-[var(--surface-media-control)] px-2 py-1 text-[10px] font-semibold text-[var(--media-control-text)] shadow-sm">Drag to position</span> : null}
          {coverChoices.length > 0 && <button type="button" disabled={disabled} onClick={() => setIsEditingCover((editing) => !editing)} aria-expanded={isEditingCover} aria-controls="draft-cover-editor" aria-label={isEditingCover ? 'Close cover editor' : 'Edit cover preview'} className="absolute bottom-2 right-2 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-default">
              <span className={`shape-compact flex items-center gap-1.5 bg-[var(--surface-media-control)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--media-control-text)] shadow-sm transition-opacity duration-150 motion-reduce:transition-none ${isEditingCover ? 'opacity-100' : 'opacity-0 group-hover/cover-preview:opacity-100 group-focus-within/cover-preview:opacity-100'}`}>
                <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" keepColor />
                {isEditingCover ? 'Close editor' : 'Edit cover'}
              </span>
            </button>}
        </div>
        <div className="flex flex-col gap-1 p-3">
          <p className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">{metadata.title.trim()}</p>
          <p className="text-[12px] text-[var(--text-secondary)]">{categoryLabel}</p>
          {metadata.summary.trim() && <FormattedText className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]" text={metadata.summary.trim()} />}
        </div>
      </article>

      {isEditingCover ? <section id="draft-cover-editor" aria-labelledby="draft-cover-editor-title" className="min-w-0 rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-inset)] p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 id="draft-cover-editor-title" className="text-[13px] font-semibold text-[var(--text-primary)]">Edit the cover</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">Choose the file, then position what visitors see.</p>
            </div>
            <button type="button" onClick={() => setIsEditingCover(false)} className="shape-compact shrink-0 px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Done</button>
          </div>
          {cover?.previewUrl ? <div className="mb-2.5 rounded-[9px] border border-[var(--hairline)] bg-[var(--surface-sunken)] p-2.5">
            <div className="flex items-center gap-2">
              <label htmlFor="draft-cover-zoom" className="shrink-0 text-[11px] font-medium text-[var(--text-secondary)]">Zoom</label>
              <input
                id="draft-cover-zoom"
                type="range"
                min={MIN_PROJECT_COVER_ZOOM}
                max={MAX_PROJECT_COVER_ZOOM}
                step="0.05"
                value={coverFrame.zoom}
                disabled={disabled}
                onChange={(event) => updateCoverFrame({
                  ...coverFrame,
                  zoom: Number(event.currentTarget.value),
                })}
                className="h-5 min-w-0 flex-1 cursor-pointer accent-[var(--accent-primary)] disabled:cursor-default"
              />
              <button
                type="button"
                disabled={disabled || isDefaultProjectCoverFrame(coverFrame)}
                onClick={() => updateCoverFrame(DEFAULT_PROJECT_COVER_FRAME)}
                aria-label="Reset cover position and zoom"
                title="Reset cover"
                className="shape-compact inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"
              >
                <InterfaceIcon icon={RotateCcwIcon} size="sm" weight="medium" />
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-tertiary)]">Drag the preview to reposition it. Arrow keys make precise adjustments; hold Shift for larger steps.</p>
          </div> : null}
          <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Project cover" className="scrollbar-slim flex max-h-[170px] flex-col gap-1 overflow-y-auto">
            {coverChoices.map((item) => {
              const itemKind = item.family === 'document' ? 'document' : item.family === 'video' ? 'video' : undefined;
              const itemRatio = item.metadata?.widthPixels && item.metadata.heightPixels ? item.metadata.widthPixels / item.metadata.heightPixels : 4 / 3;
              return <button key={item.id} type="button" role="radio" aria-checked={item.isCover} tabIndex={item.isCover ? 0 : -1} disabled={disabled} onClick={() => media.setCover(item.id)} className={`shape-compact flex min-h-12 w-full items-center gap-2 border p-1.5 text-left transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${item.isCover ? 'border-[var(--accent-primary)] bg-[var(--surface-selected)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}`}>
                  <span aria-hidden="true" className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                    {item.previewUrl ? <ProjectCover source={item.previewUrl} alt="" kind={itemKind} fit="contain" aspectRatio={itemRatio} sizes="56px" /> : <InterfaceIcon icon={FileIcon} size="md" weight="medium" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium" title={item.displayTitle}>{item.displayTitle}</span>
                  {item.isCover && <InterfaceIcon icon={CheckIcon} size="sm" weight="semibold" className="shrink-0 text-[var(--accent-text)]" />}
                </button>;
            })}
          </div>
        </section> : <ol aria-label="Assets in presentation order" className="scrollbar-slim m-0 flex max-h-[170px] list-none flex-col gap-1 overflow-y-auto p-0">
        {media.items.map((item, index) => {
          const status = processingLabel(item.processingState);
          return <li key={item.id} className="flex items-baseline gap-2 text-[12px] leading-relaxed">
              <span className="w-4 shrink-0 tabular-nums text-[var(--text-tertiary)]">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]" title={item.displayTitle}>{item.displayTitle}</span>
              <span className="shrink-0 text-[var(--text-secondary)]">{item.typeLabel}{status ? ` · ${status.toLowerCase()}` : ''}</span>
            </li>;
        })}
      </ol>}
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
        {media.items.length} {media.items.length === 1 ? 'file' : 'files'} · {formatFileSize(totalBytes)}, prepared on this device.
      </p>
    </div>;
}
