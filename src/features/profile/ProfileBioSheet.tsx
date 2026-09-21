import React from 'react';
import { MobileProjectDescriptionSheet } from '../../components/media/MobileProjectDescriptionSheet';
import { useProfileBioEditor } from './useProfileBioEditor';

export function ProfileBioSheet({ profileId, bio, canEdit, onClose }: {
  profileId: string; bio?: string; canEdit: boolean; onClose: () => void;
}) {
  const editor = useProfileBioEditor(profileId, canEdit);
  return <MobileProjectDescriptionSheet projectId={profileId} description={editor.savedValue ?? bio} contentLabel="Bio"
    emptyMessage="No bio yet." textEditor={canEdit ? editor : undefined} onClose={onClose} />;
}
