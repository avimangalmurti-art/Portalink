import React from 'react';
import type { Profile } from '../../types/domain';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { ArrowLeftIcon } from 'lucide-react';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './sharing.css';
type Props = {profile: Profile; counts?: {followers: string | null; following: string | null}; loading?: boolean};
export function PortfolioSharePreview({profile, loading = false}: Props) {
  return <section className="share-profile-preview" data-loading={loading || undefined} aria-label="Public catalogue preview" aria-busy={loading}>
    {loading ? <span className="share-profile-avatar"/> : <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="share-profile-avatar" priority />}
    <div className="share-profile-copy"><strong title={profile.name}>{profile.name}</strong>{profile.location && <p title={profile.location}>{profile.location}</p>}
    <div className="share-preview-counts"><span><b>{profile.projects.length}</b> projects</span><span><b>{profile.categories.length}</b> portals</span></div></div>
  </section>;
}
export class PortfolioPreviewBoundary extends React.Component<Props & {children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <div className="share-preview-recovery"><PortfolioSharePreview {...this.props} loading/><div><p role="alert">The preview could not load. Your catalogue link still works.</p><button type="button" onClick={()=>this.setState({failed:false})}>Retry preview</button></div></div> : this.props.children; }
}
export function PortfolioShareLoading({profile, counts, onClose}: Props & {onClose:()=>void}) {
  const viewport=useDialogViewport();
  return <div ref={viewport} data-presentation="mobile" className="portfolio-share-page" style={{top:'var(--dialog-viewport-top,0px)',height:'var(--dialog-viewport-height,100dvh)'}}><div className="portfolio-share-dialog" data-share-main role="region" aria-label="Share your catalogue" aria-busy="true"><header><button type="button" aria-label="Back" onClick={onClose}><ArrowLeftIcon size={20}/></button><h2>Share your Catalogue</h2></header><div className="portfolio-share-body"><PortfolioSharePreview profile={profile} counts={counts} loading/><section className="share-public-address"><div>Your public address</div><p><span className="share-address-skeleton"/></p></section><div className="share-actions share-main-actions" aria-hidden="true">{['Copy link','Send to someone','Write a personal note','View QR code'].map(label=><button type="button" key={label} disabled>{label}</button>)}</div></div></div></div>;
}
