import React from 'react';
import type { Profile } from '../../types/domain';
import { PortalProjectPopup } from '../../components/profile/PortalProjectPopup';
import type { PortalProjectBrowsing } from '../../components/profile/portalProjectBrowsing';

/** Preserve the public sidebar's established popup entry point. */
export function SharedPortalPopup({ profile, categoryId, onClose, onSelect, browsing }: { profile: Profile; categoryId: string; onClose: () => void; onSelect: (category: string, id: string) => void; browsing?: PortalProjectBrowsing }) {
  return <PortalProjectPopup profile={profile} categoryId={categoryId} onClose={onClose} onSelect={onSelect} browsing={browsing} />;
}
