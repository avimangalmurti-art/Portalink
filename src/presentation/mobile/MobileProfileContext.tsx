import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildPath } from '../../app/routes';
import { useAuth } from '../../contexts/AuthContext';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { contextActions } from './contextActions';
import { useMobileContextPress } from './MobileContextActions';
import { shareContextLink } from './SharedContextActions';

/** Rows know identity, not follow state; unresolved capabilities are omitted. */
export function MobileProfileContext({ profileId, name, onUnsave, children }: { profileId: string; name: string; onUnsave?: () => void; children: React.ReactElement }) {
  const auth = useAuth(), navigate = useNavigate(), location = useLocation();
  const shared = location.pathname.startsWith('/share/');
  const url = new URL(buildPath('sharedProfile', { profileId }), window.location.origin).href;
  const model = contextActions(shared ? 'shared' : 'profile', { signedIn: auth.isAuthenticated, owner: auth.viewerProfileId === profileId }, { title: name, handlers: {
    share: () => shareContextLink(url, name), copy: () => copyPublicLink(url), saveCreator: onUnsave,
    signIn: () => auth.requestAuthenticatedDestination({ kind: 'route', path: location.pathname + location.search, label: 'return to this shared view' }, 'signIn'),
    createAccount: () => auth.requestAuthenticatedDestination({ kind: 'route', path: location.pathname + location.search, label: 'return to this shared view' }, 'signUp'),
    message: () => navigate(`${buildPath('messages')}?recipient=${encodeURIComponent(profileId)}`),
  }, labels: { saveCreator: 'Unsave creator' } });
  const press = useMobileContextPress(model);
  return React.cloneElement(children, press);
}
