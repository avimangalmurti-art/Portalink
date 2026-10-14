import { useEffect, useRef, useState } from 'react';
import { CopyIcon, DownloadIcon, QrCodeIcon, SendIcon, CheckIcon } from 'lucide-react';
import type { Profile } from '../../types/domain';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { Button } from '../../components/ui/Button';
import { createPortfolioQrImage } from './portfolioQr';
export function PortfolioQrScreen({ profile, counts, url, heading, busy, copied = false, saving = false, onSave, onCopy, onSend }: { profile: Profile; counts?: { followers: string | null; following: string | null }; url: string; heading: string; busy: boolean; copied?: boolean; saving?: boolean; onSave: () => void; onCopy: () => void; onSend: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{url: string; error: string}>({url: '', error: ''});
  useEffect(() => {
    try {
      if (!canvas.current) return;
      const image = createPortfolioQrImage(url), ctx = canvas.current.getContext('2d');
      if (!ctx) throw new Error('QR image could not be displayed.');
      canvas.current.width = image.width; canvas.current.height = image.height;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0);
      setResult({url, error: ''});
    } catch (error) { setResult({url, error: error instanceof Error ? error.message : 'The QR code could not be generated.'}); }
  }, [url, attempt]);
  const state = result.url !== url ? 'loading' : result.error ? 'error' : 'ready';
  return <>
    <div className="share-introduction"><h2 id={heading}>Your portfolio QR code</h2><p>Let others scan this code to view your public portfolio.</p></div>
    <section className="share-qr-card" aria-label="Portfolio QR code and identity">
      <div className="share-qr-image" data-state={state} aria-busy={state === 'loading'}>
        <canvas ref={canvas} aria-label="QR code for your public portfolio" hidden={state !== 'ready'} />
        {state === 'loading' && <div className="share-qr-skeleton" role="status" aria-label="Generating your QR code"/>}
        {state === 'error' && <div><p role="alert">{result.error}</p><Button variant="secondary" onClick={()=>setAttempt(value=>value+1)}>Retry QR code</Button></div>}
      </div>
      <section className="share-profile-preview" aria-label="Public portfolio preview">
        <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-profile-avatar" priority />
        <strong>{profile.name}</strong>{profile.location && <p>{profile.location}</p>}
        <div className="share-preview-tabs"><span>Portfolio</span>{profile.showJourney && <span>Timeline</span>}</div>
        <div className="share-preview-stats"><span><b>{profile.projects.length}</b> projects</span><span><b>{profile.categories.length}</b> portals</span>{counts?.followers != null && <span><b>{counts.followers}</b> followers</span>}{counts?.following != null && <span><b>{counts.following}</b> following</span>}</div>
      </section>
    </section>
    <Button variant="primary" className="share-qr-save" isLoading={saving} disabled={busy || state !== 'ready'} onClick={onSave}><DownloadIcon size={22}/>{saving ? 'Preparing image…' : 'Save to photos'}</Button>
    <p className="share-qr-save-help">Downloads a PNG image. Save it to Photos from your browser.</p>
    <div className="share-actions share-main-actions"><Button variant="secondary" disabled={busy} onClick={onCopy}>{copied ? <CheckIcon size={22}/> : <CopyIcon size={22}/>}<span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span></Button><Button variant="secondary" disabled={busy} onClick={onSend}><SendIcon size={22}/>Send to someone</Button></div>
    <aside className="share-qr-info"><QrCodeIcon size={24}/><div><p>Anyone can scan this code to view your public portfolio.</p><p>This code contains your current public portfolio address.</p></div></aside>
  </>;
}
