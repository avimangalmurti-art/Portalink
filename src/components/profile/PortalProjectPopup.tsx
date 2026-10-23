import React, { useRef } from 'react';
import type { Profile } from '../../types/domain';
import { getTypefaceStack } from '../../data/typefaces';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { ModalPortal } from '../ui/ModalPortal';
import { ProjectIndexList } from './ProjectIndexList';
import { MobilePortalProjectToolbar } from './MobilePortalProjectToolbar';
import './portal-project-popup.css';

type PortalProjectPopupProps = {
  /** Canonical projects have already been filtered for the viewer's access. */
  profile: Profile;
  categoryId: string;
  onClose: () => void;
  onSelect: (categoryId: string, projectId: string) => void;
  backLabel?: string;
};

/** A portal's existing navigation list, floating over the screen that opened it. */
export function PortalProjectPopup({ profile, categoryId, onClose, onSelect, backLabel = 'Back to profile' }: PortalProjectPopupProps) {
  const presentation = usePresentation();
  const ref = useRef<HTMLElement>(null);
  useModalFocus(true, ref, onClose, true);
  const category = profile.categories.find(item => item.id === categoryId);
  const projects = profile.projects.filter(item => item.categoryId === categoryId);
  if (!category) return null;

  return <ModalPortal>
    <div data-presentation={presentation} className="shared-portal-popup-layer portal-project-popup-layer" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <ScreenBack action={onClose}>{null}</ScreenBack>
      <section data-ui-surface="popup" ref={ref} className="shared-portal-popup ps-panel" role="dialog" aria-modal="true" aria-label={category.label} tabIndex={-1}>
        <MobilePortalProjectToolbar category={category} onBack={onClose} backLabel={backLabel} sharedReadOnly
          layout="list" onLayout={() => undefined} sort="saved" onSort={() => undefined} />
        <nav data-project-index-list="" className="min-h-0 flex-1 overflow-y-auto" aria-label={`${category.label} projects`}>
          <ProjectIndexList profileId={profile.id} projects={projects}
            typefaceStacks={Object.fromEntries(projects.map(item => [item.id, getTypefaceStack(item.design?.typefaceId ?? 'default')]))}
            typefaceIds={{}} hiddenIds={[]} pinnedIds={projects.filter(item => item.isPinned).map(item => item.id)}
            activeProjectId={null} isOwner={false} sharedReadOnly onReorder={() => undefined}
            onToggleHidden={() => undefined} onTogglePinned={() => undefined} onSelect={id => {
              if (!projects.some(item => item.id === id)) return;
              onClose();
              onSelect(categoryId, id);
            }} />
        </nav>
      </section>
    </div>
  </ModalPortal>;
}
