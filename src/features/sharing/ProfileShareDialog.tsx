import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useEffect, useId, useRef, useState } from 'react';
import { XIcon, CopyIcon, SendIcon, DownloadIcon, ArrowLeftIcon, PencilIcon, QrCodeIcon, GlobeIcon, CheckIcon, LinkIcon } from 'lucide-react';
import { generate } from 'lean-qr';
import type { Profile } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { usePresentation } from '../../presentation/usePresentation';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { Button } from '../../components/ui/Button';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { PortfolioPreview } from './PortfolioPreview';
import { audienceNote, handleSuggestions, normalizePublicHandle, portfolioMailto, portfolioPath, validHandle, withReferral, type Audience, type PortfolioCard, type ShareAddress } from './shareModel';
import { dismissLivePortfolio } from '../publishing/firstProject';
import { usePortfolioAddressValidation } from './usePortfolioAddressValidation';
import { PortfolioNoteComposer } from './PortfolioNoteComposer';
import { PortfolioQrScreen } from './PortfolioQrScreen';
import { createPortfolioQrImage } from './portfolioQr';
import { PortfolioSharePreview, PortfolioPreviewBoundary } from './PortfolioSharePreview';
import './sharing.css';
export function ProfileShareDialog({ profile, owner, onClose, onBeforeShare, automatic = false, counts }: { counts?: { followers: string | null; following: string | null }; profile: Profile; owner: boolean; automatic?: boolean; onClose: () => void; onBeforeShare?: () => Promise<void> }) {
  const { profiles } = useServices(), presentation = usePresentation(), dialog = useRef<HTMLDivElement>(null), viewport = useDialogViewport(), heading = useId(), qr = useRef<HTMLCanvasElement>(null);

  const [address, setAddress] = useState<ShareAddress | null>(null), [screen, setScreen] = useState<'share'|'handle'|'send'|'qr'>('share');
  const [handle, setHandle] = useState(handleSuggestions(profile.name)[0]), [availability, setAvailability] = useState('');
  const [card, setCard] = useState<PortfolioCard | null>(null), [previewError, setPreviewError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [audience, setAudience] = useState<Audience>('friend'), [to, setTo] = useState(''), [note, setNote] = useState(audienceNote('friend',profile.name));
  const { invalidateProfiles } = useProfileData();
  useModalFocus(presentation === 'web', dialog, () => { if(!busy)close(); }, true);
  const [copied, setCopied] = useState(false), [validationRetry, setValidationRetry] = useState(0), [addressRetry, setAddressRetry] = useState(0), [addressReadError, setAddressReadError] = useState('');
  const [operation, setOperation] = useState<'copy'|'address'|'qr'|'mail'|null>(null);
  const operationLock = useRef(false);
  const [personalNote, setPersonalNote] = useState(true);
  const [via] = useState(() => crypto.randomUUID().replace(/-/g,'').slice(0,8));
  const url = new URL(portfolioPath(profile.id, address?.handle), window.location.origin).href;
  const addressValidation = usePortfolioAddressValidation(presentation === 'mobile' && screen === 'handle', handle, address, profiles.checkPublicHandle, validationRetry);
  const draftUrl = new URL(portfolioPath(profile.id, normalizePublicHandle(handle)), window.location.origin).href;
  const seenKey = `portalink.handle-intro:${profile.id}`;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const finishIntro = () => { try { localStorage.setItem(seenKey,'1'); } catch { /* Convenience only; confirmed handles persist server-side. */ } if (presentation === 'mobile') { setHandle(address?.handle ?? normalizePublicHandle(profile.handle)); setError(''); } setScreen('share'); };
  const close = () => { if(screen==='handle')finishIntro(); onClose(); };
  useEffect(() => {
    let active=true;
    void (profiles.getShareAddress?.(profile.id) ?? Promise.resolve({ handle:null, confirmed:false, available:false })).then(value => {
      if (!active) return; if(automatic && value.confirmed){closeRef.current();return;} setAddress(value); if (value.handle && addressRetry === 0) setHandle(value.handle); setAddressReadError('');
      let seen = false; try { seen=localStorage.getItem(seenKey)==='1'; } catch { /* Convenience only. */ }
      if (owner && !value.confirmed && !seen && (automatic || presentation === 'web')) setScreen('handle');
    }).catch(() => { if(active){setAddress({handle:null,confirmed:false,available:false});setAddressReadError('Your address could not be checked. Your existing link still works.');} });
    if (presentation === 'web') void (profiles.getPortfolioCard?.(profile.id) ?? Promise.resolve(null)).then(value => {if(active){setCard(value);if(!value)setPreviewError('A pasted preview is not available yet. Your portfolio link still opens.');}}).catch(()=>{if(active)setPreviewError('The public preview could not load. Reopen Share to try again.');});
    return()=>{active=false;};
  }, [profile.id, profiles, automatic, owner, seenKey, presentation, addressRetry]);
  useEffect(() => {
    if(screen!=='handle' || presentation === 'mobile')return; const normalized=normalizePublicHandle(handle);
    if(!validHandle(normalized)){setAvailability('Use 3–30 lowercase letters, numbers or dots. Reserved addresses cannot be used.');return;}
    if(!address?.available){setAvailability('Short addresses are not enabled yet. Continue with your existing link.');return;}
    if(normalized===address.handle||normalized===normalizePublicHandle(profile.handle)){setAvailability('Your current address');return;}
    let active=true;setAvailability('Checking…');
    const timer=setTimeout(()=>{void profiles.checkPublicHandle?.(normalized).then(value=>{if(active)setAvailability(value==='available'?'Available':value==='unavailable'?'Short addresses are not enabled yet.':'That address is taken.');}).catch(e=>{if(active)setAvailability(e.message);});},350);
    return()=>{active=false;clearTimeout(timer);};
  },[handle,screen,address?.available,address?.handle,profile.handle,profiles,presentation]);
  useEffect(()=>{if(screen==='share'&&qr.current&&address)generate(url).toCanvas(qr.current,{pad:4,off:[255,255,255,255]});},[url,screen,address]);
  useEffect(()=>{if(presentation === 'web' && screen === 'qr')setScreen('share');},[presentation,screen]);
  useEffect(()=>{if(profile.isPrivate)closeRef.current();},[profile.isPrivate]);
  const prepare = async () => { if(profile.isPrivate)throw new Error('Make your portfolio public before sharing.'); await onBeforeShare?.(); if(owner&&address?.handle)await profiles.markHandleShared?.(profile.id,address.handle); };
  const complete = () => { if(owner){dismissLivePortfolio(profile.id);window.dispatchEvent(new CustomEvent('portalink:portfolio-shared',{detail:{profileId:profile.id}}));} };
  const run = async (action:()=>Promise<void>, kind: 'copy'|'address'|'qr'|'mail' = 'mail') => { if(operationLock.current)return;operationLock.current=true;setBusy(true);setOperation(kind);setError('');try{await action();}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError')){setError(e instanceof Error?e.message:'Please try again.');if(kind === 'address')setValidationRetry(value=>value+1);}}finally{operationLock.current=false;setBusy(false);setOperation(null);} };
  const copy = () => run(async()=>{await prepare();await copyPublicLink(url);complete();setCopied(true);}, 'copy');
  const send = () => { setNotice('');setError('');setPersonalNote(false);setScreen('send'); };
  useEffect(()=>{setCopied(false);},[url]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2500);return()=>clearTimeout(timer);},[copied]);
  const saveQr = () => run(async()=>{
    await prepare();const output=createPortfolioQrImage(url);
    const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('QR image could not be saved.');const object=URL.createObjectURL(blob),a=document.createElement('a');a.href=object;a.download=`${address?.handle||'portfolio'}-qr.png`;a.click();setTimeout(()=>URL.revokeObjectURL(object),1000);complete();setNotice(presentation === 'mobile' ? 'QR image download requested' : 'QR image ready');
  }, 'qr');
  const claim = () => run(async()=>{if(!profiles.claimPublicHandle)throw new Error('Short addresses are not enabled yet.');const value=await profiles.claimPublicHandle(profile.id,handle);setAddress(value);invalidateProfiles();if (presentation === 'mobile') { setHandle(value.handle ?? ''); setScreen('share'); setNotice('Address saved'); } else finishIntro();}, 'address');
  useEffect(() => {
    if (presentation !== 'mobile' || (screen !== 'send' && screen !== 'handle')) return;
    const body = dialog.current?.querySelector<HTMLElement>('.portfolio-share-body');
    if (!body) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !body.contains(field) || !field.matches('input, textarea')) return;
        const rect = field.getBoundingClientRect(), bounds = body.getBoundingClientRect();
        const feedback = screen === 'handle' ? body.querySelector('.share-handle-validation')?.getBoundingClientRect() : null;
        if (rect.top < bounds.top || rect.bottom > bounds.bottom || (feedback && feedback.bottom > bounds.bottom)) field.scrollIntoView({ block: screen === 'handle' ? 'center' : 'nearest', behavior: 'instant' });
      });
    };
    body.addEventListener('focusin', reveal);
    const observer = new ResizeObserver(reveal); observer.observe(body);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); body.removeEventListener('focusin', reveal); };
  }, [presentation, screen]);
  const content = <div ref={viewport} data-presentation={presentation} className={presentation === 'mobile' ? 'portfolio-share-page' : 'portfolio-share-scrim modal-scrim'} style={{top:'var(--dialog-viewport-top, 0px)',height:'var(--dialog-viewport-height, 100dvh)'}} onClick={e=>{if(presentation === 'web' && e.target===e.currentTarget&&!busy)close();}}>
    <div ref={dialog} data-qr-screen={presentation === 'mobile' && screen === 'qr' || undefined} data-note-composer={presentation === 'mobile' && screen === 'send' && personalNote || undefined} data-address-editor={presentation === 'mobile' && screen === 'handle' || undefined} data-share-main={presentation === 'mobile' && screen === 'share' || undefined} data-personal-note={presentation === 'mobile' && screen === 'send' || undefined} className="portfolio-share-dialog" role={presentation === 'mobile' ? 'region' : 'dialog'} aria-modal={presentation === 'web' ? true : undefined} aria-labelledby={heading} tabIndex={-1}>
      <header>{presentation === 'mobile' && <ScreenBack visibleOnMobile action={() => { if (!busy) { if (screen === 'share') close(); else finishIntro(); } }}><button type="button" disabled={busy} onClick={() => { if (screen === 'share') close(); else finishIntro(); }} aria-label="Back"><ArrowLeftIcon size={20}/></button></ScreenBack>}{presentation === 'web' && screen!=='share'&&<button type="button" onClick={finishIntro} aria-label="Back to sharing"><ArrowLeftIcon size={20}/></button>}<h2 hidden={presentation === 'mobile' && (screen !== 'share' && (screen !== 'send' || personalNote))} id={presentation === 'mobile' && (screen !== 'share' && (screen !== 'send' || personalNote)) ? undefined : heading}>{screen==='handle'?'Your address.':screen==='send'?(presentation === 'mobile' && personalNote ? 'Personal note' : 'Send to someone'):(presentation === 'mobile' ? 'Share your Portfolio' : 'Share your portfolio')}</h2>{presentation === 'web' && <button type="button" onClick={close} disabled={busy} aria-label="Close share"><XIcon size={20}/></button>}</header>
      <div className="portfolio-share-body">
        {presentation === 'mobile' && screen === 'qr' ? <PortfolioQrScreen profile={profile} counts={counts} url={url} heading={heading} busy={busy} copied={copied} saving={operation === 'qr'} onSave={()=>void saveQr()} onCopy={()=>void copy()} onSend={send} /> : presentation === 'mobile' && screen === 'send' && personalNote ? <PortfolioNoteComposer profile={profile} counts={counts} note={note} url={url} heading={heading} disabled={busy} onChange={setNote} onContinue={()=>setPersonalNote(false)} /> : screen==='handle' ? (presentation === 'mobile' ? <>
          <div className="share-introduction"><h2 id={heading}>Your portfolio address</h2><p>Choose a short address for your public portfolio.</p></div>
          <section className="share-profile-preview" aria-label="Public portfolio preview">
            <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-profile-avatar" priority />
            <strong>{profile.name}</strong>{profile.location && <p>{profile.location}</p>}
            <div className="share-preview-tabs"><span>Portfolio</span>{profile.showJourney && <span>Journey</span>}</div>
            <div className="share-preview-stats">
              <span><b>{profile.projects.length}</b> projects</span><span><b>{profile.categories.length}</b> portals</span>
              {counts?.followers !== null && counts?.followers !== undefined && <span><b>{counts.followers}</b> followers</span>}
              {counts?.following !== null && counts?.following !== undefined && <span><b>{counts.following}</b> following</span>}
            </div>
          </section>
          <label htmlFor={`${heading}-handle`}>Your public address</label>
          <div className="share-handle-editor"><span title={window.location.host}>{window.location.host}/</span><input id={`${heading}-handle`} disabled={busy} value={handle} onChange={e=>{setHandle(normalizePublicHandle(e.target.value));setError('');}} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} autoComplete="off" aria-describedby={`${heading}-validation ${heading}-url`} aria-invalid={addressValidation.status === 'invalid' || addressValidation.status === 'unavailable'} /></div>
          <p id={`${heading}-validation`} role={error ? 'alert' : 'status'} className="share-handle-validation" data-state={addressValidation.status}>{addressValidation.status === 'available' && <CheckIcon size={18}/>}<span>{error || addressReadError || addressValidation.message}</span>{(addressValidation.status === 'error' || addressReadError || error) && <button type="button" disabled={busy} onClick={()=>{setError('');if(addressReadError)setAddressRetry(value=>value+1);else setValidationRetry(value=>value+1);}}>Retry</button>}</p>
          <p id={`${heading}-url`} className="share-handle-url"><LinkIcon size={18}/><span>{validHandle(normalizePublicHandle(handle)) ? draftUrl : 'Enter a valid handle to preview your address.'}</span></p>
          <Button variant="primary" className="share-save-address" isLoading={operation === 'address'} disabled={busy || addressValidation.status !== 'available'} onClick={()=>void claim()}>{operation === 'address' ? 'Saving address…' : 'Save address'}</Button>
          <aside className="share-address-info"><GlobeIcon size={24}/><div><p>This will be your public portfolio address.</p><p>Anyone with this link can view your portfolio.</p><p>After sharing, an old address keeps working for 90 days when changed.</p></div></aside>
        </> : <><p>A short link that feels like your own website.</p><label htmlFor={`${heading}-handle`}>Your address</label><div className="handle-field"><span>{window.location.host}/</span><input id={`${heading}-handle`} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} value={handle} onChange={e=>setHandle(normalizePublicHandle(e.target.value))}/></div><p role="status">{availability}</p><div className="share-suggestions">{handleSuggestions(profile.name).map(value=><button type="button" key={value} onClick={()=>setHandle(value)}>{value}</button>)}</div><p className="share-fine-print">After you share, an old address keeps working for 90 days if you change it. Your original portfolio link always works.</p><Button variant="primary" disabled={busy||!address?.available||!['Available','Your current address'].includes(availability)} onClick={()=>void claim()}>Use this address</Button><button type="button" className="share-text-button" onClick={finishIntro}>Continue with existing link</button></>):
        <>{presentation === 'mobile' && screen === 'share' ? <>
          <PortfolioPreviewBoundary profile={profile} counts={counts}><PortfolioSharePreview profile={profile} counts={counts}/></PortfolioPreviewBoundary>
          <section className="share-public-address" aria-label="Your public address"><div><span>Your public address</span>{owner && <button type="button" onClick={()=>setScreen('handle')}><PencilIcon size={17}/>Edit handle</button>}</div><p aria-busy={!address}>{address ? url.replace(/^https?:\/\//,'') : <span className="share-address-skeleton" aria-label="Loading public address"/>}</p></section>
          <div className="share-actions share-main-actions">
            <Button variant="primary" disabled={busy} onClick={()=>void copy()}>{copied ? <CheckIcon size={22}/> : <CopyIcon size={22}/>}<span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span></Button>
            <Button variant="secondary" disabled={busy} onClick={send}><SendIcon size={22}/>Send to someone</Button>
            <Button variant="secondary" disabled={busy} onClick={()=>{setNotice('');setError('');setPersonalNote(true);setScreen('send');}}><PencilIcon size={22}/>Write a personal note</Button>
            <Button variant="secondary" disabled={busy} onClick={()=>{setNotice('');setError('');setScreen('qr');}}><QrCodeIcon size={22}/>View QR code</Button>
          </div>

          <aside className="share-explanation"><GlobeIcon size={24}/><div><p>This is how your link previews when you paste it.</p><p>You can edit your handle anytime.</p></div></aside>
        </> : <>{screen==='share'?<><div className="share-address"><span>{url.replace(/^https?:\/\//,'')}</span>{owner&&<button type="button" onClick={()=>setScreen('handle')}>Edit handle</button>}</div><p className="share-fine-print">This is how your link previews when you paste it.</p></>:<><div className="share-suggestions" aria-label="Who is it for?">{(['professor','employer','friend'] as const).map(value=><button type="button" key={value} aria-pressed={audience===value} onClick={()=>{setAudience(value);setNote(audienceNote(value,profile.name));}}>{value==='employer'?'An employer':value==='professor'?'A professor':'A friend'}</button>)}</div><label htmlFor={`${heading}-to`}>To</label><input id={`${heading}-to`} type="email" value={to} autoComplete="off" placeholder="Email address" onChange={e=>setTo(e.target.value)}/><label htmlFor={`${heading}-note`}>Note</label><textarea id={`${heading}-note`} value={note} maxLength={3000} rows={4} onChange={e=>setNote(e.target.value)}/></>}
        {!(presentation === 'mobile' && screen === 'send') && (card?<PortfolioPreview card={card} url={url}/>:<p role="status">{previewError||'Loading your public preview…'}</p>)}
        {screen==='share'?<><div className="share-actions"><Button variant="primary" disabled={busy} onClick={()=>void copy()}><CopyIcon size={18}/>Copy link</Button><Button variant="secondary" disabled={busy} onClick={send}><SendIcon size={18}/>Send to someone</Button></div><button type="button" className="share-text-button" onClick={()=>setScreen('send')}>Write a personal note</button><div className="share-qr"><canvas ref={qr} aria-label="QR code for this portfolio"/><Button variant="secondary" disabled={busy} onClick={()=>void saveQr()}><DownloadIcon size={18}/>Save QR</Button></div></>:<><Button variant="primary" disabled={busy} onClick={()=>void run(async()=>{const mailto=portfolioMailto(to,note,profile.name,withReferral(url,via));await prepare();window.location.href=mailto;complete();})}>Open in Mail</Button><p className="share-fine-print">Opens your email app. Portalink does not send anything or store the address.</p></>}
</>}        </>}
        <div className="share-flow-feedback">{notice&&<p role="status">{notice}</p>}{error&&screen !== 'handle'&&<p role="alert">{error}</p>}{addressReadError&&screen !== 'handle'&&<p role="alert">{addressReadError}<button type="button" onClick={()=>setAddressRetry(value=>value+1)}>Retry address</button></p>}</div>
      </div>
    </div>
  </div>;
  return presentation === 'mobile' ? content : <ModalPortal>{content}</ModalPortal>;
}
