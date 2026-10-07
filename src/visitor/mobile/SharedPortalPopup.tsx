import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import React, { useRef } from 'react';
import type { Profile } from '../../types/domain';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { ProjectIndexList } from '../../components/profile/ProjectIndexList';
import { MobilePortalProjectToolbar } from '../../components/profile/MobilePortalProjectToolbar';
import { useModalFocus } from '../../hooks/useModalFocus';
import { getTypefaceStack } from '../../data/typefaces';
export function SharedPortalPopup({ profile, categoryId, onClose, onSelect }: { profile: Profile; categoryId: string; onClose: () => void; onSelect: (category: string, id: string) => void }) {
  const ref=useRef<HTMLElement>(null);
  useModalFocus(true,ref,onClose);
  const category=profile.categories.find(item=>item.id===categoryId);
  const projects=profile.projects.filter(item=>item.categoryId===categoryId);
  if (!category) return null;
  return <ModalPortal><div data-presentation="mobile" className="shared-portal-popup-layer" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <ScreenBack action={onClose}>{null}</ScreenBack>
    <section ref={ref} className="shared-portal-popup ps-panel" role="dialog" aria-modal="true" aria-label={category.label} tabIndex={-1}>
      <MobilePortalProjectToolbar category={category} onBack={onClose} sharedReadOnly layout="list" onLayout={()=>undefined} sort="saved" onSort={()=>undefined}/>
      <nav data-project-index-list="" className="min-h-0 flex-1 overflow-y-auto" aria-label={`${category.label} projects`}><ProjectIndexList profileId={profile.id} projects={projects} typefaceStacks={Object.fromEntries(projects.map(item=>[item.id,getTypefaceStack(item.design?.typefaceId??'default')]))} typefaceIds={{}} hiddenIds={[]} pinnedIds={projects.filter(item=>item.isPinned).map(item=>item.id)} activeProjectId={null} isOwner={false} sharedReadOnly onReorder={()=>undefined} onToggleHidden={()=>undefined} onTogglePinned={()=>undefined} onSelect={id=>{onClose();onSelect(categoryId,id);}}/></nav>
    </section>
  </div></ModalPortal>;
}
