import React, { useRef, useState } from 'react';
import type { Profile } from '../../types/domain';
import { getTypefaceStack } from '../../data/typefaces';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { ModalPortal } from '../ui/ModalPortal';
import { EmptyState } from '../ui/StateViews';
import { ProjectIndexList } from './ProjectIndexList';
import { MobilePortalProjectToolbar, type MobileProjectSort } from './MobilePortalProjectToolbar';
import { sortPortalProjects, type PortalProjectBrowsing } from './portalProjectBrowsing';
import './portal-project-popup.css';
import { projectBelongsToPortal } from '../../features/projects/projectPortals';

type PortalProjectPopupProps = {
  /** Canonical projects have already been filtered for the viewer's access. */
  profile: Profile;
  categoryId: string;
  onClose: () => void;
  onBack?: () => void;
  onSelect: (categoryId: string, projectId: string) => void;
  backLabel?: string;
  browsing?: PortalProjectBrowsing;
  /** Public Portal choosers opt their WEB popup into the existing browse tools. */
  desktopBrowsing?: boolean;
  /** URL-driven popups navigate on selection instead of separately dismissing. */
  closeOnSelect?: boolean;
};

/** A portal's existing navigation list, floating over the screen that opened it. */
export function PortalProjectPopup({ profile, categoryId, onClose, onBack = onClose, onSelect, backLabel = 'Back to profile', browsing, desktopBrowsing = false,
  closeOnSelect = true }: PortalProjectPopupProps) {
  const presentation = usePresentation();
  const [localLayout, setLocalLayout] = useState<'list' | 'grid'>('list');
  const [localSort, setLocalSort] = useState<MobileProjectSort>('recent');
  const { layout, sort, onLayout, onSort } = browsing ?? { layout: localLayout, sort: localSort, onLayout: setLocalLayout, onSort: setLocalSort };
  const ref = useRef<HTMLElement>(null);
  useModalFocus(true, ref, onClose, true);
  const category = profile.categories.find(item => item.id === categoryId);
  const projects = profile.projects.filter(item => projectBelongsToPortal(item, categoryId));
  const webBrowsing = presentation === 'web' && desktopBrowsing;
  const visibleProjects = presentation === 'mobile' || webBrowsing ? sortPortalProjects(projects, sort) : projects;
  if (!category) return null;

  return <ModalPortal>
    <div data-presentation={presentation} className="shared-portal-popup-layer portal-project-popup-layer" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <ScreenBack action={onBack}>{null}</ScreenBack>
      <section data-ui-surface="popup" data-web-portal-browsing={webBrowsing ? '' : undefined} data-portal-link-entry={!closeOnSelect ? '' : undefined}
        ref={ref} className="shared-portal-popup ps-panel" role="dialog" aria-modal="true" aria-label={category.label} tabIndex={-1}>
        <MobilePortalProjectToolbar category={category} onBack={onBack} backLabel={backLabel} sharedReadOnly browsingControls={presentation === 'mobile' || webBrowsing}
          layout={layout} onLayout={onLayout} sort={sort} onSort={onSort} />
        <nav data-project-index-list="" className="min-h-0 flex-1 overflow-y-auto" aria-label={`${category.label} projects`}>
          {(presentation === 'mobile' || webBrowsing) && !projects.length && <EmptyState title={`No projects in ${category.label}`} description="No work has been published in this portal." />}
          <ProjectIndexList profileId={profile.id} projects={visibleProjects} mobileLayout={layout} readOnlyBrowsing={webBrowsing}
            typefaceStacks={Object.fromEntries(projects.map(item => [item.id, getTypefaceStack(item.design?.typefaceId ?? 'default')]))}
            typefaceIds={{}} hiddenIds={[]} pinnedIds={projects.filter(item => item.categoryId === categoryId && item.isPinned).map(item => item.id)}
            activeProjectId={null} isOwner={false} sharedReadOnly onReorder={() => undefined}
            onToggleHidden={() => undefined} onTogglePinned={() => undefined} onSelect={id => {
              if (!projects.some(item => item.id === id)) return;
              if (closeOnSelect) onClose();
              onSelect(categoryId, id);
            }} />
        </nav>
      </section>
    </div>
  </ModalPortal>;
}
