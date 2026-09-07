import { useEffect, useState } from 'react';
import type { ProjectCoverFrame } from '../../types/domain';
import type { ImageCropResult } from '../../types/imageCrop';
import { normalizeProjectCoverFrame } from '../../utils/coverFrame';
import { ImageRepositionDialog } from './ImageRepositionDialog';
import { projectPreviewSource } from './projectPreviewSource';

type Props = {
  source: string | Blob;
  kind?: 'image' | 'video' | 'document';
  pageNumber?: number;
  alt: string;
  frame?: ProjectCoverFrame;
  aspectRatio?: number;
  onClose: () => void;
  onSave: (result: ImageCropResult & { frame: ProjectCoverFrame }) => void | Promise<void>;
};

/** Every authoring entry edits the same cover frame used by profile and discovery. */
export function ProjectCoverRepositionDialog({ source, kind = 'image', pageNumber = 1, alt, frame, aspectRatio = 16 / 9, onClose, onSave }: Props) {
  const initialFrame = normalizeProjectCoverFrame(frame);
  const initialRatio = initialFrame.aspectRatio ?? aspectRatio;
  const [ratio, setRatio] = useState(initialRatio);
  const [prepared, setPrepared] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const isImage = kind === 'image';
  useEffect(() => {
    if (isImage) return;
    const abort = new AbortController();
    const ownedUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
    setPrepared(null);
    setError(null);
    void projectPreviewSource(ownedUrl ?? source as string, kind, pageNumber, abort.signal).then((blob) => {
      if (!abort.signal.aborted) setPrepared(blob);
    }).catch((caught) => {
      if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : 'The preview could not be prepared. Try again.');
    });
    return () => { abort.abort(); if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [attempt, isImage, kind, pageNumber, source]);
  const ratios = [
    { value: initialRatio, label: 'Current shape' },
    { value: 1, label: 'Square · 1:1' },
    { value: 4 / 3, label: 'Landscape · 4:3' },
    { value: 16 / 9, label: 'Wide · 16:9' },
    { value: 3 / 4, label: 'Portrait · 3:4' },
  ].filter((item, index, all) => all.findIndex((other) => Math.abs(other.value - item.value) < 0.00001) === index);
  return <ImageRepositionDialog title="Reposition project preview" source={isImage ? source : prepared ?? ''} alt={alt} aspectRatio={ratio} initialPosition={initialFrame} outputWidth={1920}
    preparing={!isImage && !prepared} preparationError={error} onRetryPreparation={() => setAttempt((value) => value + 1)} onClose={onClose}
    controls={<label className="mb-4 flex items-center justify-between gap-3 text-[13px] text-[var(--text-secondary)]">Preview shape
      <select aria-label="Project preview shape" value={ratio} onChange={(event) => setRatio(Number(event.target.value))} className="text-control h-9 min-w-0 rounded-[8px] px-2 text-[13px] text-[var(--text-primary)]">
        {ratios.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>}
    onSave={(result) => onSave({ ...result, frame: { ...result.position, crop: result.crop, aspectRatio: ratio } })}
  />;
}
