import React from 'react';
import type { Profile } from '../../types/domain';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { ArrowLeftIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './sharing.css';
type Props = {profile: Profile; counts?: {followers: string | null; following: string | null}; loading?: boolean};
export function PortfolioSharePreview({profile, counts, loading = false}: Props) {
  return <section className="share-profile-preview" data-loading={loading || undefined} aria-label="Public portfolio preview" aria-busy={loading}>
    {loading ? <span className="share-profile-avatar"/> : <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-profile-avatar" priority />}
    <strong>{profile.name}</strong>{profile.location && <p>{profile.location}</p>}
    <div className="share-preview-tabs"><span>Portfolio</span>{profile.showJourney && <span>Journey</span>}</div>
    <div className="share-preview-stats"><span><b>{profile.projects.length}</b> projects</span><span><b>{profile.categories.length}</b> portals</span>{counts?.followers != null && <span><b>{counts.followers}</b> followers</span>}{counts?.following != null && <span><b>{counts.following}</b> following</span>}</div>
  </section>;
}
export class PortfolioPreviewBoundary extends React.Component<Props & {children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <div className="share-preview-recovery"><PortfolioSharePreview {...this.props} loading/><div><p role="alert">The preview could not load. Your portfolio link still works.</p><button type="button" onClick={()=>this.setState({failed:false})}>Retry preview</button></div></div> : this.props.children; }
}
export function PortfolioShareLoading({profile, counts, onClose}: Props & {onClose:()=>void}) {
  const viewport=useDialogViewport();
  return <div ref={viewport} data-presentation="mobile" className="portfolio-share-page" style={{top:'var(--dialog-viewport-top,0px)',height:'var(--dialog-viewport-height,100dvh)'}}><div className="portfolio-share-dialog" data-share-main role="region" aria-label="Share your portfolio" aria-busy="true"><header><button type="button" aria-label="Back" onClick={onClose}><ArrowLeftIcon size={20}/></button></header><div className="portfolio-share-body"><div className="share-introduction"><h2>Share your portfolio</h2><p>Anyone with the link can view your public portfolio.</p></div><PortfolioSharePreview profile={profile} counts={counts} loading/><section className="share-public-address"><div>Your public address</div><p><span className="share-address-skeleton"/></p></section><div className="share-actions share-main-actions" aria-hidden="true">{['Copy link','Send to someone','Write a personal note','View QR code'].map(label=><button type="button" key={label} disabled>{label}</button>)}</div></div></div></div>;
}
