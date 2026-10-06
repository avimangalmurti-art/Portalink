import { useInternalContentShare } from '../../features/sharing/InternalContentShare';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { readSharedReturnPath } from '../../features/auth/registration';
import { copyPublicLink } from '../../utils/copyPublicLink';
import { MobileScreenActions } from './MobileContextActions';
import { contextActions } from './contextActions';

export async function shareContextLink(url: string, title?: string) {
  if (navigator.share) {
    try { await navigator.share({ url, title }); return; }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
  }
  await copyPublicLink(url);
}

export function SharedContextActions({ title }: { title?: string }) {
  const sendContent = useInternalContentShare();
  const auth = useAuth(), { pathname, search } = useLocation(), navigate = useNavigate();
  const path = readSharedReturnPath(pathname + search);
  if (!path) return null;
  const url = new URL(path, window.location.origin).href;
  const account = (view: 'signIn' | 'signUp') => auth.requestAuthenticatedDestination({ kind: 'route', path, label: 'return to this shared view' }, view);
  const portfolio = pathname.startsWith('/share/') ? pathname.split('/').slice(0, 3).join('/') : pathname;
  return <MobileScreenActions model={contextActions('shared', { signedIn: auth.isAuthenticated }, { title, labels: { categories: 'Portals' }, handlers: {
    signIn: () => account('signIn'), createAccount: () => account('signUp'),
    share: () => /^\/share\/[^/]+\/c\/[^/]+\/[^/]+/.test(pathname) ? sendContent({url,title:title ?? 'Project'}) : shareContextLink(url, title), copy: () => copyPublicLink(url),
    categories: () => navigate(`${portfolio}?view=portals`),
    settings: () => navigate('/settings', { state: { settingsReturn: path } }),
  } })} priority={100} />;
}
