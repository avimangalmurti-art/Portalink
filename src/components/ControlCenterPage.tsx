import React, { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ChevronDownIcon } from 'lucide-react';
import { NavigationButtonsPanel } from './settings/NavigationButtonsPanel';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { Button } from './ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useRouteNavigator } from '../app/useAppRoute';
import { buildPath } from '../app/routes';
import { DeleteAccountDialog } from '../features/auth/DeleteAccountDialog';
import { AccountSecurityPage } from '../features/auth/AccountSecurityPage';
import type { AppearanceTheme, StoredAppearanceMode } from '../utils/appearancePreferences';
import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import './settings/settings-page.css';

type ControlCenterPageProps = {
  theme: AppearanceTheme;
  appearanceMode: StoredAppearanceMode;
  onAppearanceModeChange: (mode: StoredAppearanceMode) => void;
  systemGray: string;
  onSystemGrayChange: (id: string) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  highContrast: boolean;
  onHighContrastChange: (enabled: boolean) => void;
  reduceTranslucency: boolean;
  onReduceTranslucencyChange: (enabled: boolean) => void;
  onBack: () => void;
  onOpenProfile: () => void;
  appearanceSaving?: boolean;
  appearanceError?: string | null;
  onRetryAppearance?: () => void;
};

function SettingsSection({ id, title, subtitle, children }: {
  id: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <section className="settings-section">
    <h2><button type="button" className="settings-section-trigger" aria-expanded={open} aria-controls={`settings-${id}`} onClick={() => setOpen(value => !value)}>
      <span className="settings-section-label"><span className="settings-section-title">{title}</span><span className="settings-section-subtitle">{subtitle}</span></span>
      <InterfaceIcon icon={ChevronDownIcon} className={open ? 'settings-chevron is-open' : 'settings-chevron'} />
    </button></h2>
    {open && <div id={`settings-${id}`} className="settings-section-content">{children}</div>}
  </section>;
}

/** A normal shell destination; the sidebar gear never opens a settings modal. */
export function ControlCenterPage(props: ControlCenterPageProps) {
  const auth = useAuth();
  const nav = useRouteNavigator();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  function openAccountRoute(destination: 'messages' | 'notifications') {
    const path = buildPath(destination);
    if (!auth.isAuthenticated) {
      auth.requestAuthenticatedDestination({ kind: 'route', path, label: destination === 'messages' ? 'read your messages' : 'view your notifications' });
      return;
    }
    nav.to(path);
  }

  async function inviteFriend() {
    const inviteUrl = new URL(`${buildPath('home')}?welcome=1`, PUBLIC_ORIGIN).toString();
    setInviteStatus('idle');
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Portalink Networks', text: 'Join me on the Portalink Network.', url: inviteUrl });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyInvite(false);
  }

  async function copyInvite(resetStatus = true) {
    const inviteUrl = new URL(`${buildPath('home')}?welcome=1`, PUBLIC_ORIGIN).toString();
    if (resetStatus) setInviteStatus('idle');
    try { await navigator.clipboard.writeText(inviteUrl); setInviteStatus('copied'); }
    catch { setInviteStatus('failed'); }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(false);
    try { if (!await auth.signOut()) setSignOutError(true); }
    catch { setSignOutError(true); }
    finally { setSigningOut(false); }
  }

  if (searchParams.get('security') === '1') return <AccountSecurityPage key={auth.user?.id ?? 'guest'} onBack={() => {
    if (location.state?.accountSecurityReturn && window.history.state?.idx > 0) { nav.back(); return; }
    const next = new URLSearchParams(searchParams);
    next.delete('security');
    setSearchParams(next, { replace: true, state: location.state });
  }} />;

  return <div className="settings-page">
    <header className="settings-page-header">
      <button type="button" onClick={props.onBack} aria-label="Back" className="settings-back"><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button>
      <h1>Settings</h1>
    </header>
    <div className="settings-page-sections">
      <SettingsSection id="appearance" title="Appearance" subtitle="Theme, accent colour, layout">
        {props.appearanceError ? <p role="alert">{props.appearanceError} <button type="button" onClick={props.onRetryAppearance} className="settings-text-action">Try again</button></p> : props.appearanceSaving ? <p role="status" className="settings-appearance-saving">Saving website colors…</p> : null}
        <NavigationButtonsPanel {...props} />
      </SettingsSection>
      <SettingsSection id="account" title="Account" subtitle="Profile, security, log out, delete account">
        {auth.isAuthenticated ? <>
          <Button variant="secondary" onClick={props.onOpenProfile}><span className="settings-action-label">View profile</span></Button>
          {auth.viewerProfileId && <Button variant="secondary" onClick={nav.profileEditor}><span className="settings-action-label">Edit profile</span></Button>}
          <Button variant="secondary" onClick={() => { const next = new URLSearchParams(searchParams); next.set('security', '1'); setSearchParams(next, { state: { ...location.state, accountSecurityReturn: true } }); }}><span className="settings-action-label">Account security</span></Button>
          <Button variant="secondary" disabled={signingOut || auth.phase === 'signing-out'} onClick={() => void handleSignOut()}><span className="settings-action-label">{signingOut ? 'Logging out…' : 'Log out'}</span></Button>
          <Button variant="secondary" onClick={() => setDeletingAccount(true)}><span className="settings-action-label">Delete account…</span></Button>
          {signOutError && <p role="alert">Unable to log out. Please try again.</p>}
        </> : <><Button onClick={() => auth.requestAuthenticatedDestination({ kind: 'my-profile' }, 'signIn')}><span className="settings-action-label">Sign in</span></Button><Button variant="secondary" onClick={() => auth.requestAuth('signUp')}><span className="settings-action-label">Create account</span></Button></>}
      </SettingsSection>
      <SettingsSection id="invite" title="Invite a friend" subtitle="Share Portalink with others">
        <Button variant="secondary" onClick={() => void inviteFriend()}><span className="settings-action-label">Share invite link</span></Button>
        <Button variant="secondary" onClick={() => void copyInvite()}><span className="settings-action-label">Copy invite link</span></Button>
        {inviteStatus !== 'idle' && <p role="status">{inviteStatus === 'copied' ? 'Invite link copied.' : 'Unable to share the invite link. Please try again.'}</p>}
      </SettingsSection>
      <SettingsSection id="privacy" title="Privacy" subtitle="Data, permissions, visibility">
        <p>Manage your account visibility in Edit profile and who can message you in Message settings.</p>
        {auth.viewerProfileId && <Button variant="secondary" onClick={nav.profileEditor}><span className="settings-action-label">Account visibility</span></Button>}
        <Button variant="secondary" onClick={() => openAccountRoute('messages')}><span className="settings-action-label">Open messages</span></Button>
      </SettingsSection>
      <SettingsSection id="notifications" title="Notifications" subtitle="Messages, requests, updates">
        <Button variant="secondary" onClick={() => openAccountRoute('notifications')}><span className="settings-action-label">View notifications</span></Button>
      </SettingsSection>
      <SettingsSection id="language" title="Language" subtitle="App language and region">
        <p>Portalink is currently available in English.</p>
      </SettingsSection>
      <SettingsSection id="about" title="About" subtitle="Version, legal and more">
        <Button variant="secondary" onClick={() => { const next = new URLSearchParams(searchParams); next.set('terms', '1'); setSearchParams(next); }}><span className="settings-action-label">Terms</span></Button>
        <p>Portalink Networks</p><p>Web app</p>
      </SettingsSection>
    </div>
    {deletingAccount && <DeleteAccountDialog isOpen onClose={() => setDeletingAccount(false)} />}
  </div>;
}
