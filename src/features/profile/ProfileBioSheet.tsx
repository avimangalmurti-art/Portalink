import React from 'react';
import { MobileProjectDescriptionSheet } from '../../components/media/MobileProjectDescriptionSheet';
import { useProfileBioEditor } from './useProfileBioEditor';
import { usePresentation } from '../../presentation/usePresentation';

export function ProfileBioSheet({ profileId, bio, canEdit, onClose }: {
  profileId: string; bio?: string; canEdit: boolean; onClose: () => void;
}) {
  const editor = useProfileBioEditor(profileId, canEdit);
  const isMobile = usePresentation() === 'mobile';
  return <MobileProjectDescriptionSheet projectId={profileId} description={editor.savedValue ?? bio} contentLabel={isMobile ? 'About' : 'Bio'}
    fullScreenEditor={isMobile} directEditAction={isMobile} emptyMessage={isMobile ? 'No profile details yet.' : 'No bio yet.'} textEditor={canEdit ? editor : undefined} onClose={onClose} />;
}
