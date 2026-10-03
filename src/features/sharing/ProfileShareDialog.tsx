import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useEffect, useId, useRef, useState } from 'react';
import { XIcon, CopyIcon, SendIcon, DownloadIcon, ArrowLeftIcon } from 'lucide-react';
import { generate } from 'lean-qr';
import type { Profile } from '../../types/domain';
import { useServices } from '../../contexts/ServicesContext';
import { usePresentation } from '../../presentation/usePresentation';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { Button } from '../../components/ui/Button';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { PortfolioPreview } from './PortfolioPreview';
import { audienceNote, handleSuggestions, normalizePublicHandle, portfolioMailto, portfolioPath, validHandle, withReferral, type Audience, type PortfolioCard, type ShareAddress } from './shareModel';
import { dismissLivePortfolio } from '../publishing/firstProject';
import './sharing.css';
export function ProfileShareDialog({ profile, owner, onClose, onBeforeShare, automatic = false }: { profile: Profile; owner: boolean; automatic?: boolean; onClose: () => void; onBeforeShare?: () => Promise<void> }) {
  const { profiles } = useServices(), presentation = usePresentation(), dialog = useRef<HTMLDivElement>(null), viewport = useDialogViewport(), heading = useId(), qr = useRef<HTMLCanvasElement>(null);

  const [address, setAddress] = useState<ShareAddress | null>(null), [screen, setScreen] = useState<'share'|'handle'|'send'>('share');
  const [handle, setHandle] = useState(handleSuggestions(profile.name)[0]), [availability, setAvailability] = useState('');
  const [card, setCard] = useState<PortfolioCard | null>(null), [previewError, setPreviewError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [audience, setAudience] = useState<Audience>('friend'), [to, setTo] = useState(''), [note, setNote] = useState(audienceNote('friend',profile.name));
  const { invalidateProfiles } = useProfileData();
  useModalFocus(presentation === 'web', dialog, () => { if(!busy)close(); }, true);
  const [nativeReady, setNativeReady] = useState(false);
  const [via] = useState(() => crypto.randomUUID().replace(/-/g,'').slice(0,8));
  const url = new URL(portfolioPath(profile.id, address?.handle), window.location.origin).href;
  const seenKey = `portalink.handle-intro:${profile.id}`;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const finishIntro = () => { try { localStorage.setItem(seenKey,'1'); } catch { /* Convenience only; confirmed handles persist server-side. */ } setScreen('share'); };
  const close = () => { if(screen==='handle')finishIntro(); onClose(); };
  useEffect(() => {
    let active=true;
    void (profiles.getShareAddress?.(profile.id) ?? Promise.resolve({ handle:null, confirmed:false, available:false })).then(value => {
      if (!active) return; if(automatic && value.confirmed){closeRef.current();return;} setAddress(value); if (value.handle) setHandle(value.handle);
      let seen = false; try { seen=localStorage.getItem(seenKey)==='1'; } catch { /* Convenience only. */ }
      if (owner && !value.confirmed && !seen) setScreen('handle');
    }).catch(() => { if(active){setAddress({handle:null,confirmed:false,available:false});setError('Short addresses could not be checked. Your existing link still works.');} });
    void (profiles.getPortfolioCard?.(profile.id) ?? Promise.resolve(null)).then(value => {if(active){setCard(value);if(!value)setPreviewError('A pasted preview is not available yet. Your portfolio link still opens.');}}).catch(()=>{if(active)setPreviewError('The public preview could not load. Reopen Share to try again.');});
    return()=>{active=false;};
  }, [profile.id, profiles, automatic, owner, seenKey]);
  useEffect(() => {
    if(screen!=='handle')return; const normalized=normalizePublicHandle(handle);
    if(!validHandle(normalized)){setAvailability('Use 3–30 lowercase letters, numbers or dots. Reserved addresses cannot be used.');return;}
    if(!address?.available){setAvailability('Short addresses are not enabled yet. Continue with your existing link.');return;}
    if(normalized===address.handle||normalized===normalizePublicHandle(profile.handle)){setAvailability('Your current address');return;}
    let active=true;setAvailability('Checking…');
    const timer=setTimeout(()=>{void profiles.checkPublicHandle?.(normalized).then(value=>{if(active)setAvailability(value==='available'?'Available':value==='unavailable'?'Short addresses are not enabled yet.':'That address is taken.');}).catch(e=>{if(active)setAvailability(e.message);});},350);
    return()=>{active=false;clearTimeout(timer);};
  },[handle,screen,address?.available,address?.handle,profile.handle,profiles]);
  useEffect(()=>{if(screen==='share'&&qr.current&&address)generate(url).toCanvas(qr.current,{pad:4,off:[255,255,255,255]});},[url,screen,address]);
  useEffect(()=>{if(profile.isPrivate)closeRef.current();},[profile.isPrivate]);
  const prepare = async () => { if(profile.isPrivate)throw new Error('Make your portfolio public before sharing.'); await onBeforeShare?.(); if(owner&&address?.handle)await profiles.markHandleShared?.(profile.id,address.handle); };
  const complete = () => { if(owner){dismissLivePortfolio(profile.id);window.dispatchEvent(new CustomEvent('portalink:portfolio-shared',{detail:{profileId:profile.id}}));} };
  const run = async (action:()=>Promise<void>) => { if(busy)return;setBusy(true);setError('');try{await action();}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);} };
  const copy = () => run(async()=>{await prepare();await copyPublicLink(url);complete();setNotice('Link copied');});
  const send = () => {
    if(typeof navigator.share!=='function'){setScreen('send');return;}
    // Async appearance/alias writes must finish before a fresh click supplies
    // transient activation to iOS. The next button opens the system sheet directly.
    if(!nativeReady){void run(async()=>{await prepare();setNativeReady(true);setNotice('Your link is ready to send.');});return;}
    const result=navigator.share({title:`${profile.name} — Portfolio`,url});
    void run(async()=>{try{await result;complete();setNotice('Share sheet closed');}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;setScreen('send');setNotice('Write a note and open it in your email app.');}});
  };
  const saveQr = () => run(async()=>{
    await prepare();const code=generate(url), raw=document.createElement('canvas');code.toCanvas(raw,{pad:4,off:[255,255,255,255]});
    const output=document.createElement('canvas');output.width=1024;output.height=1024;const ctx=output.getContext('2d');if(!ctx)throw new Error('QR image could not be created.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);ctx.imageSmoothingEnabled=false;const size=Math.floor(1024/raw.width)*raw.width;ctx.drawImage(raw,(1024-size)/2,(1024-size)/2,size,size);
    const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw new Error('QR image could not be saved.');const object=URL.createObjectURL(blob),a=document.createElement('a');a.href=object;a.download=`${address?.handle||'portfolio'}-qr.png`;a.click();setTimeout(()=>URL.revokeObjectURL(object),1000);complete();setNotice('QR image ready');
  });
  const claim = () => run(async()=>{if(!profiles.claimPublicHandle)throw new Error('Short addresses are not enabled yet.');const value=await profiles.claimPublicHandle(profile.id,handle);setAddress(value);setNativeReady(false);invalidateProfiles();finishIntro();});
  useEffect(() => {
    if (presentation !== 'mobile' || screen !== 'send') return;
    const body = dialog.current?.querySelector<HTMLElement>('.portfolio-share-body');
    if (!body) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !body.contains(field) || !field.matches('input, textarea')) return;
        const rect = field.getBoundingClientRect(), bounds = body.getBoundingClientRect();
        if (rect.top < bounds.top || rect.bottom > bounds.bottom) field.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      });
    };
    body.addEventListener('focusin', reveal);
    const observer = new ResizeObserver(reveal); observer.observe(body);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); body.removeEventListener('focusin', reveal); };
  }, [presentation, screen]);
  const content = <div ref={viewport} data-presentation={presentation} className={presentation === 'mobile' ? 'portfolio-share-page' : 'portfolio-share-scrim modal-scrim'} style={{top:'var(--dialog-viewport-top, 0px)',height:'var(--dialog-viewport-height, 100dvh)'}} onClick={e=>{if(presentation === 'web' && e.target===e.currentTarget&&!busy)close();}}>
    <div ref={dialog} data-personal-note={presentation === 'mobile' && screen === 'send' || undefined} className="portfolio-share-dialog" role={presentation === 'mobile' ? 'region' : 'dialog'} aria-modal={presentation === 'web' ? true : undefined} aria-labelledby={heading} tabIndex={-1}>
      <header>{presentation === 'mobile' && <ScreenBack visibleOnMobile action={() => { if (!busy) { if (screen === 'share') close(); else finishIntro(); } }}><button type="button" disabled={busy} onClick={() => { if (screen === 'share') close(); else finishIntro(); }} aria-label="Back"><ArrowLeftIcon size={20}/></button></ScreenBack>}{presentation === 'web' && screen!=='share'&&<button type="button" onClick={finishIntro} aria-label="Back to sharing"><ArrowLeftIcon size={20}/></button>}<h2 id={heading}>{screen==='handle'?'Your address.':screen==='send'?(presentation === 'mobile' ? 'Personal note' : 'Send to someone'):'Share your portfolio'}</h2>{presentation === 'web' && <button type="button" onClick={close} disabled={busy} aria-label="Close share"><XIcon size={20}/></button>}</header>
      <div className="portfolio-share-body">
        {screen==='handle'?<><p>A short link that feels like your own website.</p><label htmlFor={`${heading}-handle`}>Your address</label><div className="handle-field"><span>{window.location.host}/</span><input id={`${heading}-handle`} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30} value={handle} onChange={e=>setHandle(normalizePublicHandle(e.target.value))}/></div><p role="status">{availability}</p><div className="share-suggestions">{handleSuggestions(profile.name).map(value=><button type="button" key={value} onClick={()=>setHandle(value)}>{value}</button>)}</div><p className="share-fine-print">After you share, an old address keeps working for 90 days if you change it. Your original portfolio link always works.</p><Button variant="primary" disabled={busy||!address?.available||!['Available','Your current address'].includes(availability)} onClick={()=>void claim()}>Use this address</Button><button type="button" className="share-text-button" onClick={finishIntro}>Continue with existing link</button></>:
        <>{screen==='share'?<><div className="share-address"><span>{url.replace(/^https?:\/\//,'')}</span>{owner&&<button type="button" onClick={()=>setScreen('handle')}>Edit handle</button>}</div><p className="share-fine-print">This is how your link previews when you paste it.</p></>:<><div className="share-suggestions" aria-label="Who is it for?">{(['professor','employer','friend'] as const).map(value=><button type="button" key={value} aria-pressed={audience===value} onClick={()=>{setAudience(value);setNote(audienceNote(value,profile.name));}}>{value==='employer'?'An employer':value==='professor'?'A professor':'A friend'}</button>)}</div><label htmlFor={`${heading}-to`}>To</label><input id={`${heading}-to`} type="email" value={to} autoComplete="off" placeholder="Email address" onChange={e=>setTo(e.target.value)}/><label htmlFor={`${heading}-note`}>Note</label><textarea id={`${heading}-note`} value={note} maxLength={3000} rows={4} onChange={e=>setNote(e.target.value)}/></>}
        {!(presentation === 'mobile' && screen === 'send') && (card?<PortfolioPreview card={card} url={url}/>:<p role="status">{previewError||'Loading your public preview…'}</p>)}
        {screen==='share'?<><div className="share-actions"><Button variant="primary" disabled={busy||!address} onClick={()=>void copy()}><CopyIcon size={18}/>Copy link</Button><Button variant="secondary" disabled={busy||!address} onClick={send}><SendIcon size={18}/>{nativeReady ? 'Open share sheet' : 'Send to someone'}</Button></div><button type="button" className="share-text-button" onClick={()=>setScreen('send')}>Write a personal note</button><div className="share-qr"><canvas ref={qr} aria-label="QR code for this portfolio"/><Button variant="secondary" disabled={busy||!address} onClick={()=>void saveQr()}><DownloadIcon size={18}/>Save QR</Button></div></>:<><Button variant="primary" disabled={busy||!address} onClick={()=>void run(async()=>{const mailto=portfolioMailto(to,note,profile.name,withReferral(url,via));await prepare();window.location.href=mailto;complete();})}>Open in Mail</Button><p className="share-fine-print">Opens your email app. Portalink does not send anything or store the address.</p></>}
        </>}
        {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
      </div>
    </div>
  </div>;
  return presentation === 'mobile' ? content : <ModalPortal>{content}</ModalPortal>;
}
