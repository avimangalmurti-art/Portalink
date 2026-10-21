import React from 'react';
import type { Profile } from '../../types/domain';
import { PortalProjectPopup } from '../../components/profile/PortalProjectPopup';

/** Preserve the public sidebar's established popup entry point. */
export function SharedPortalPopup({ profile, categoryId, onClose, onSelect }: { profile: Profile; categoryId: string; onClose: () => void; onSelect: (category: string, id: string) => void }) {
  return <PortalProjectPopup profile={profile} categoryId={categoryId} onClose={onClose} onSelect={onSelect} />;
}
