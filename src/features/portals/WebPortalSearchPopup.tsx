import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon } from 'lucide-react';
import { PortalProjectPopup } from '../../components/profile/PortalProjectPopup';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { EmptyState, ErrorState } from '../../components/ui/StateViews';
import { useSharedProfileQuery } from '../profile/useSharedProfileQuery';
import { useModalFocus } from '../../hooks/useModalFocus';
import type { PublicPortalSummary } from '../../types/portals';
import './web-portal-search-popup.css';
import { projectBelongsToPortal } from '../projects/projectPortals';
import { portalChildren } from '../profile/portalHierarchy';

/** Only the selected public bundle loads; selecting a project opens its reader. */
export function WebPortalSearchPopup({ portal, onClose, onSelect }: {
  portal: PublicPortalSummary; onClose: () => void; onSelect: (profileId: string, categoryId: string, projectId: string) => void;
}) {
  const query = useSharedProfileQuery(portal.profileId, null, portal.id);
  const [portalPath, setPortalPath] = useState([portal.id]);
  const profile = useMemo(() => {
    const value = query.profile;
    if (query.status !== 'ready' || !value || value.id !== portal.profileId || value.isPrivate || !value.categories.some(item => item.id === portal.id)) return null;
    return { ...value, projects: value.projects.filter(item => item.isPubliclyVisible !== false) };
  }, [query.profile, query.status, portal.profileId, portal.id]);
  if (profile) {
    const activeId = portalPath.at(-1) ?? portal.id;
    const category = profile.categories.find(item => item.id === activeId);
    const opener = profile.categories.find(item => item.id === portalPath.at(-2));
    const openPortalId = category?.id ?? portal.id;
    return <PortalProjectPopup profile={profile} categoryId={openPortalId} onClose={onClose}
      onBack={opener && category ? () => setPortalPath(current => current.slice(0, -1)) : onClose}
      backLabel={opener && category ? `Back to ${opener.label}` : 'Back to Portal search'} desktopBrowsing onOpenChild={id => {
        if (portalChildren(profile.categories, openPortalId).some(item => item.id === id)) setPortalPath([...(category ? portalPath : [portal.id]), id]);
      }} onSelect={(categoryId, projectId) => {
        if (categoryId !== openPortalId || !profile.projects.some(item => item.id === projectId && projectBelongsToPortal(item, categoryId))) return;
        onSelect(profile.id, categoryId, projectId);
      }} />;
  }
  return <PortalSearchPopupStatus portal={portal} onClose={onClose}>
    {query.status === 'error' ? <ErrorState title="Projects could not be loaded" description="Check your connection and try again." onRetry={query.retry} />
      : query.status === 'not-found' || query.status === 'ready' ? <EmptyState title="This portal is unavailable" description="It may no longer be public." />
      : <div className="web-portal-search-status" role="status" aria-label="Loading portal projects" aria-live="polite"><span className="premium-media-loading-mark" aria-hidden="true" /></div>}
  </PortalSearchPopupStatus>;
}

function PortalSearchPopupStatus({ portal, onClose, children }: { portal: PublicPortalSummary; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useModalFocus(true, ref, onClose, true);
  return <ModalPortal><div data-presentation="web" className="shared-portal-popup-layer portal-project-popup-layer" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={ref} data-ui-surface="popup" data-web-portal-search-status="" className="shared-portal-popup ps-panel" role="dialog" aria-modal="true" aria-label={portal.label} tabIndex={-1}>
      <header className="mobile-portal-index-toolbar"><div className="mobile-portal-index-heading">
        <button type="button" className="mobile-portal-index-control" aria-label="Back to Portal search" onClick={onClose}><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /></button>
        <InterfaceIcon icon={getCategoryIcon(portal.iconName ?? '')} size="lg" />
        <h2>{portal.label}</h2>
      </div></header>
      <div className="web-portal-search-status-content">{children}</div>
    </section>
  </div></ModalPortal>;
}
