import { useEffect, useRef, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { CoverFilmstrip } from '../../components/publishing/CoverFilmstrip';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import { generateCoverThumbnails } from '../media/coverThumbnailRenderer';
import { firstProjectMonth, firstProjectTitle, EMPTY_CREATION } from './firstProject';
import type { usePublishProject } from './usePublishProject';

type Flow = ReturnType<typeof usePublishProject>;
export function FirstProjectFiles({ flow, name, categories, busy, onSkip }: { flow: Flow; name: string; categories: string[]; busy: boolean; onSkip: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [editingCover, setEditingCover] = useState(false);
  const [preview, setPreview] = useState<{ key: string; url?: string; error?: string }>({ key: '' });
  const [attempt, setAttempt] = useState(0);
  const cover = flow.media.cover;
  const file = flow.media.items[0];
  const source = cover?.previewUrl;
  const frameKey = JSON.stringify(cover?.metadata?.coverFrame);
  const page = cover?.metadata?.coverPageNumber ?? 1;
  const key = `${cover?.id}:${page}:${frameKey}`;
  const current = useRef(flow);
  current.current = flow;
  const titleTouched = useRef(false), monthTouched = useRef(Boolean(flow.presetMadeIn || flow.metadata.creationDetails?.madeIn));
  const firstFileId = useRef<string>();
  const previousDefaults = useRef<{ title: string; month: string }>();
  const details = flow.metadata.creationDetails ?? EMPTY_CREATION;
  useEffect(() => {
    if (!file || firstFileId.current === file.id) return;
    firstFileId.current = file.id;
    if (!current.current.metadata.title || (!titleTouched.current && current.current.metadata.title === previousDefaults.current?.title)) current.current.setField('title', firstProjectTitle(file.fileName));
    if (!current.current.metadata.creationDetails?.madeIn || (!monthTouched.current && current.current.metadata.creationDetails.madeIn === previousDefaults.current?.month)) current.current.setCreationDetails({ ...(current.current.metadata.creationDetails ?? EMPTY_CREATION), madeIn: firstProjectMonth(file.file.lastModified) });
    previousDefaults.current = { title: firstProjectTitle(file.fileName), month: firstProjectMonth(file.file.lastModified) };
  }, [file]);
  useEffect(() => {
    if (!source || !cover || !['image', 'document', 'video'].includes(cover.family)) return;
    let cancelled = false, ownedUrl: string | undefined;
    const selected = cover;
    void generateCoverThumbnails({ kind: cover.family as 'image' | 'document' | 'video', sourceUrl: source, pageNumber: page,
      frame: cover.metadata?.coverFrame }, info => {
        if (cancelled) return;
        current.current.media.setPageCount(selected.id, info.pageCount, info.width && info.height ? { widthPixels: info.width, heightPixels: info.height } : undefined);
        if (selected.id !== firstFileId.current) return;
        const flowNow = current.current;
        if (!titleTouched.current && (!flowNow.metadata.title || flowNow.metadata.title === firstProjectTitle(selected.fileName))) {
          flowNow.setField('title', firstProjectTitle(selected.fileName, info.title));
          if (previousDefaults.current) previousDefaults.current.title = firstProjectTitle(selected.fileName, info.title);
        }
        const currentDetails = flowNow.metadata.creationDetails ?? EMPTY_CREATION;
        if (!monthTouched.current && (!currentDetails.madeIn || currentDetails.madeIn === firstProjectMonth(selected.file.lastModified))) {
          flowNow.setCreationDetails({ ...currentDetails, madeIn: firstProjectMonth(selected.file.lastModified, info.createdAt) });
          if (previousDefaults.current) previousDefaults.current.month = firstProjectMonth(selected.file.lastModified, info.createdAt);
        }
      }).then(variants => {
        if (cancelled) return;
        const variant = variants.find(item => item.size === 800);
        if (!variant) throw new Error('The cover could not be prepared.');
        ownedUrl = URL.createObjectURL(variant.blob);
        setPreview({ key, url: ownedUrl });
      }).catch(error => { if (!cancelled) setPreview({ key, error: error instanceof Error ? error.message : 'Could not prepare this cover.' }); });
    return () => { cancelled = true; if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
    // Only the selected source/page/crop restarts rendering; page-count updates do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, cover?.id, cover?.family, frameKey, page, key, attempt]);
  const choose = () => input.current?.click();
  return <section className="first-project-files">
    <input ref={input} type="file" accept="image/*,application/pdf,video/*" className="sr-only" aria-label="Choose your first project file" disabled={busy} onChange={event => { flow.media.select(event.target.files, file?.id); event.target.value = ''; }} />
    {!file ? <>
      <p className="first-project-welcome">Welcome, {name.trim().split(/\s+/)[0] || 'creator'}</p>
      <h3>{flow.presetMadeIn ? `Add work from ${flow.presetMadeIn.slice(0, 4)}` : 'Add your first project'}</h3>
      <p>{flow.presetMadeIn ? 'Bring earlier work into your Timeline. You can adjust the month and year below.' : 'Drop in something you’ve made. See it become the first tile in your catalogue.'}</p>
      <button type="button" className="first-project-drop" disabled={busy} onClick={choose}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) flow.media.select(Array.from(event.dataTransfer.files).slice(0, 1)); }}>
        <PlusIcon aria-hidden="true" size={32} /><span>Choose a file</span><small>PDF, image or video</small>
      </button>
      <Button type="button" variant="primary" size="lg" fullWidth disabled={busy} onClick={choose}>Choose from Files</Button>
      <button type="button" className="first-project-skip" disabled={busy} onClick={onSkip}>Skip for now</button>
    </> : <>
      <p className="first-project-file-name">{file.fileName}{file.metadata?.pageCount ? ` · ${file.metadata.pageCount} ${file.metadata.pageCount === 1 ? 'page' : 'pages'}` : ''}</p>
      <div className="first-project-cover" aria-live="polite">
        {preview.key === key && preview.url ? <img src={preview.url} alt="Your project cover" data-first-project-cover="" />
          : cover?.family === 'image' && source ? <img src={source} alt="Your project cover" />
          : <p role="status">{preview.key === key && preview.error ? preview.error : cover ? 'Preparing your cover…' : 'Choose a PDF, image or video for your cover.'}</p>}
        {preview.key === key && preview.error && <button type="button" className="mobile-publish-edit" onClick={() => setAttempt(value => value + 1)}>Retry cover</button>}
      </div>
      <p className="first-project-cover-caption">{cover?.family === 'document' ? `Cover from page ${page}` : cover?.family === 'video' ? 'Cover from first frame' : 'Cover from your image'} · <button type="button" disabled={busy || flow.upload.phase === 'uploaded'} onClick={() => setEditingCover(value => !value)}>{editingCover ? 'Done' : cover?.family === 'document' ? 'Choose another page' : 'Edit cover'}</button></p>
      {editingCover && <CoverFilmstrip naturalShape media={flow.media} disabled={busy || flow.upload.phase === 'uploaded'} />}
      <ProfileField id="publish-title" label="Title" required value={flow.metadata.title} maxLength={80} error={flow.fieldErrors.title} disabled={busy} onChange={value => { titleTouched.current = true; flow.setField('title', value); }} />
      <div className="first-project-facts">
        <label>Made in<input aria-label="Made in" type="month" value={details.madeIn} disabled={busy} onChange={event => { monthTouched.current = true; flow.setCreationDetails({ ...details, madeIn: event.target.value }); }} /></label>
        <label>Field<input aria-label="Field" list="first-project-fields" placeholder="e.g. Architecture" maxLength={120} value={details.field} disabled={busy} onChange={event => flow.setCreationDetails({ ...details, field: event.target.value })} />
          <datalist id="first-project-fields">{[...new Set(categories)].map(label => <option key={label} value={label} />)}</datalist>
        </label>
      </div>
      <button type="button" className="mobile-publish-edit" disabled={busy || flow.upload.phase === 'uploaded'} onClick={choose}>Choose a different file</button>
    </>}
    {flow.media.error && <p role="alert" className="mobile-publish-error">{flow.media.error}</p>}
  </section>;
}
