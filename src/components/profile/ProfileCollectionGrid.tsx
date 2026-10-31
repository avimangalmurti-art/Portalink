import { PreviewCreatorName } from './PreviewCreatorName';
import { usePresentation } from '../../presentation/usePresentation';
import { MobileProfileContext } from '../../presentation/mobile/MobileProfileContext';
import React from 'react';
import { Link } from 'react-router-dom';
import type { PortfolioCategory } from '../../types/domain';
import type { ProfileConnection } from '../../types/social';
import { buildPath } from '../../app/routes';
import { CreatorAvatar } from './CreatorAvatar';
import { getCategoryIcon } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { EmptyState } from '../ui/StateViews';

type Props = {
  shared?: boolean;
  profileId: string;
  kind: 'portals' | 'followers' | 'following';
  portals: PortfolioCategory[];
  people: ProfileConnection[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry?: () => void;
  onLoadMore: () => void;
};

export function ProfileCollectionGrid({ shared = false, profileId, kind, portals, people, loading, error, hasMore, onRetry, onLoadMore }: Props) {
  const isMobile = usePresentation() === 'mobile';
  const isPortals = kind === 'portals';
  const title = isPortals ? 'Portals' : kind === 'followers' ? 'Followers' : 'Following';
  const count = isPortals ? portals.length : people.length;
  return <section className="profile-collection" aria-label={title} aria-busy={loading}>
    {isPortals && <h2 className="mb-5 text-[14px] font-medium text-[var(--text-secondary)]">{title}</h2>}
    {count > 0 && <ul className="profile-collection-grid">
      {isPortals ? portals.map((portal) => <li key={portal.id}>
        <Link to={buildPath(shared ? 'sharedProfileCategory' : 'profileCategory', { profileId, categoryId: portal.id })} className="profile-collection-link" title={portal.label}>
          <span className="profile-collection-tile squircle" aria-hidden="true"><InterfaceIcon icon={getCategoryIcon(portal.iconName)} size="xl" /></span>
          <span className="profile-collection-name">{portal.label}</span>
        </Link>
      </li>) : people.map((person) => <MobileProfileContext key={person.profileId} profileId={person.profileId} name={person.name}><li>
        <Link data-preview-open="" to={buildPath(shared ? 'sharedProfile' : 'profile', { profileId: person.profileId }) + (isMobile ? `?fromConnections=${encodeURIComponent(profileId)}&connectionList=${kind}` : '')} className="profile-collection-link" title={person.name}>
          <span className="profile-collection-tile profile-collection-avatar squircle"><CreatorAvatar name={person.name} avatar={person.avatar} shape="squircle" className="h-full w-full text-[28px]" fallbackClassName="bg-transparent text-[var(--text-secondary)] ring-transparent" /></span>
          <span className="profile-collection-name">{isMobile ? <PreviewCreatorName name={person.name} active centered /> : person.name}</span>
        </Link>
      </li></MobileProfileContext>)}
    </ul>}
    {error && <div role="alert" className="mt-4 text-[14px] text-[var(--text-secondary)]"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 shape-compact px-3 py-2 font-medium">Try again</button>}</div>}
    {loading && <p role="status" className="py-6 text-[14px] text-[var(--text-secondary)]">Loading…</p>}
    {!loading && !error && count === 0 && <EmptyState title={isPortals ? 'No portals yet' : kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />}
    {!error && hasMore && <button type="button" disabled={loading} onClick={onLoadMore} className="side-panel-primary-control mt-6 shape-compact bg-[var(--control-rest-surface)] px-4 text-[14px] disabled:opacity-45">Show more</button>}
  </section>;
}
