import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useServices } from '../../contexts/ServicesContext';
import type { ProjectPortalMemberships } from '../../types/domain';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { Button } from '../../components/ui/Button';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';

export function ProjectPortalMembershipDialog({ project, onClose }: {
  project: { id: string; title: string; profileId: string };
  onClose: () => void;
}) {
  const { projects } = useServices();
  const { isAuthenticated, viewerProfileId } = useAuth();
  const { invalidateProfiles } = useProfileData();
  const [membership, setMembership] = useState<ProjectPortalMemberships | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const isOwner = isAuthenticated && viewerProfileId === project.profileId;

  useEffect(() => {
    if (!isOwner || !projects.getPortalMemberships) return;
    let cancelled = false;
    setLoadFailed(false);
    void projects.getPortalMemberships(project.id).then(value => {
      if (cancelled) return;
      setMembership(value);
      setSelected(value.selectedPortalIds);
    }).catch(() => {
      if (!cancelled) setLoadFailed(true);
    });
    return () => { cancelled = true; };
  }, [attempt, isOwner, project.id, projects]);

  if (!isOwner) return null;
  const changed = membership !== null && (selected.length !== membership.selectedPortalIds.length
    || selected.some(id => !membership.selectedPortalIds.includes(id)));

  const save = async () => {
    if (!changed || !projects.setPortalMemberships) return;
    setPending(true);
    try {
      await projects.setPortalMemberships(project.id, selected);
      invalidateProfiles();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return <ConfirmationDialog title="Feature in Portals" confirmLabel="Save" pendingLabel="Saving…" pending={pending}
    confirmDisabled={!changed} onConfirm={save} onCancel={onClose}
    description={<>
      <p>Choose where “{project.title}” appears.</p>
      {loadFailed ? <div className="mt-3">
        <p role="alert">Your Portals could not be loaded.</p>
        <Button className="mt-2" onClick={() => setAttempt(value => value + 1)}>Try again</Button>
      </div> : membership ? <fieldset disabled={pending} className="mt-4 max-h-[min(42dvh,24rem)] min-w-0 overflow-y-auto overscroll-contain px-1 py-0.5 text-start">
        <legend className="sr-only">Portals for this project</legend>
        {membership.portals.map(portal => {
          const primary = portal.id === membership.primaryPortalId;
          return <label key={portal.id} className="flex min-h-11 items-center gap-3 rounded-[var(--ui-row-radius)] px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            <InterfaceIcon icon={getCategoryIcon(portal.iconName)} size="sm" />
            <span className="min-w-0 flex-1 break-words">
              {portal.label}
              {primary && <span className="block text-xs text-[var(--text-secondary)]">Original Portal</span>}
            </span>
            <input type="checkbox" className="h-[18px] w-[18px] shrink-0 accent-[var(--accent-primary)]" checked={primary || selected.includes(portal.id)}
              disabled={primary} onChange={event => {
                const checked = event.currentTarget.checked;
                setSelected(ids => checked ? [...ids, portal.id] : ids.filter(id => id !== portal.id));
              }} />
          </label>;
        })}
        {membership.portals.length === 1 && <p className="px-3 py-2">Create another Portal to feature this project there.</p>}
      </fieldset> : <div className="grid min-h-14 place-items-center" role="status" aria-label="Loading Portals">
        <span className="premium-media-loading-mark" aria-hidden="true" />
      </div>}
    </>} />;
}
