import { useServices } from '../../contexts/ServicesContext';
import { PortfolioPreview } from '../sharing/PortfolioPreview';
import { portfolioPath, type PortfolioCard } from '../sharing/shareModel';
import '../sharing/sharing.css';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { useEffect, useState } from 'react';
import type { Profile } from '../../types/domain';
import { ProjectCover } from '../../components/media/ProjectCover';
import { Button } from '../../components/ui/Button';
import { dismissLivePortfolio, readLivePortfolio, livePortfolioDismissed } from './firstProject';

export function PortfolioLiveCard({ profile, publishedProjectId, onBeforeShare, onOpenShare }: { profile: Profile; publishedProjectId?: string; onBeforeShare?: () => void | Promise<void>; onOpenShare?: () => void }) {
  const { profiles } = useServices();
  const [card, setCard] = useState<PortfolioCard | null>(null), [handle, setHandle] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(() => readLivePortfolio(profile.id));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setProjectId(current => livePortfolioDismissed(profile.id) ? null : readLivePortfolio(profile.id) ?? publishedProjectId ?? current); }, [profile.id, publishedProjectId]);
  useEffect(() => { let active=true; void profiles.getPortfolioCard?.(profile.id).then(value=>{if(active)setCard(value);}).catch(()=>undefined); void profiles.getShareAddress?.(profile.id).then(value=>{if(active)setHandle(value.handle);}).catch(()=>undefined); const dismiss=(event:Event)=>{if((event as CustomEvent).detail?.profileId===profile.id)setProjectId(null);}; window.addEventListener('portalink:portfolio-shared',dismiss); return()=>{active=false;window.removeEventListener('portalink:portfolio-shared',dismiss);}; }, [profile.id, profiles]);
  const project = profile.projects.find(item => item.id === projectId);
  if (!project || profile.isPrivate || project.sessionOnly || project.isPubliclyVisible === false) return null;
  const url = new URL(portfolioPath(profile.id,handle),window.location.origin).href;
  const share = async (native: boolean) => {
    if (native && onOpenShare) { onOpenShare(); return; }
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await onBeforeShare?.();
      if (handle) await profiles.markHandleShared?.(profile.id, handle);
      if (native && typeof navigator.share === 'function') await navigator.share({ title: `${profile.name} — Portfolio`, url });
      else await copyPublicLink(url);
      dismissLivePortfolio(profile.id); setProjectId(null);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) setError('Could not share the link. Please try again.');
    } finally { setBusy(false); }
  };
  return <section className="portfolio-live-card" aria-labelledby="portfolio-live-heading">
    <h3 id="portfolio-live-heading">Your portfolio is live</h3>
    {card ? <PortfolioPreview card={card} url={url}/> : <div className="portfolio-share-preview">
      <div className="portfolio-share-cover"><ProjectCover source={project.cover} thumbnail={project.coverThumbnail} kind={project.coverKind} pageNumber={project.coverPageNumber} frame={project.coverFrame} alt={project.title} fit="contain" priority /></div>
      <div><strong>{profile.name}</strong>{profile.headline && <p>{profile.headline}</p>}<small>{url.replace(/^https?:\/\//, '')}</small></div>
    </div>}
    <div className="portfolio-live-actions"><Button variant="primary" disabled={busy} onClick={() => void share(false)}>Copy link</Button><Button variant="secondary" disabled={busy} onClick={() => void share(true)}>Send to someone</Button></div>
    <button type="button" className="first-project-skip" onClick={() => { dismissLivePortfolio(profile.id); setProjectId(null); }}>Not now</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
