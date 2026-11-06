import React, { useState } from 'react';
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { readSettingsSection, settingsSectionParams, type SettingsSectionId } from './settings/settingsSections';
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
import { usePresentation } from '../presentation/usePresentation';
import { MobileHomeScreenInstall } from '../features/install/MobileHomeScreenInstall';
import { ProfessionalEntry } from './auth/ProfessionalEntry';
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
  /** Public viewing retains the session without offering account management. */
  sharedReadOnly?: boolean;
};

function SettingsSection({ id, title, subtitle, children, active, onOpen, inline = false }: {
  id: SettingsSectionId; title: string; subtitle: string; children: React.ReactNode;
  active: SettingsSectionId | null; onOpen: (id: SettingsSectionId) => void; inline?: boolean;
}) {
  if (inline) return <section className="settings-section" data-settings-dropdown={id}>
    <h2><button type="button" className="settings-section-trigger" aria-expanded={active === id} aria-controls={`settings-${id}-content`} onClick={() => onOpen(id)}>
      <span className="settings-section-label"><span className="settings-section-title">{title}</span><span className="settings-section-subtitle">{subtitle}</span></span>
      <InterfaceIcon icon={ChevronRightIcon} className={`settings-chevron${active === id ? ' settings-chevron-expanded' : ''}`} mirroredInRtl />
    </button></h2>
    {active === id && <div id={`settings-${id}-content`} className="settings-section-content">{children}</div>}
  </section>;
  if (active) return active === id ? <section className="settings-section settings-subscreen-card"><div className="settings-section-content">{children}</div></section> : null;
  return <section className="settings-section">
    <h2><button type="button" className="settings-section-trigger" onClick={() => onOpen(id)}>
      <span className="settings-section-label"><span className="settings-section-title">{title}</span><span className="settings-section-subtitle">{subtitle}</span></span>
      <InterfaceIcon icon={ChevronRightIcon} className="settings-chevron" mirroredInRtl />
    </button></h2>
  </section>;
}

/** A normal shell destination; the sidebar gear never opens a settings modal. */
export function ControlCenterPage(props: ControlCenterPageProps) {
  const isMobile = usePresentation() === 'mobile';
  const auth = useAuth();
  const nav = useRouteNavigator();
  const location = useLocation(), navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sharedReadOnly = props.sharedReadOnly === true;
  const section = readSettingsSection(params.get('section'));
  const sharedLanding = sharedReadOnly && (params.get('security') === '1' || section === 'account' || section === 'privacy' || section === 'notifications' || section === 'about');
  const accountSecurityOpen = !sharedReadOnly && params.get('security') === '1';
  const activeSection = !isMobile && sharedLanding ? 'about' : !isMobile && accountSecurityOpen ? 'account' : section;
  const requestedPanel = params.get('panel');
  const appearancePanel = section === 'appearance' && (requestedPanel === 'system-grey' || requestedPanel === 'appearance') ? requestedPanel : null;
  const sectionTitles: Record<SettingsSectionId, string> = { appearance: 'Appearance', account: 'Account', invite: 'Invite a friend', privacy: 'Privacy', notifications: 'Notifications', language: 'Language', about: 'About' };
  const openSection = (id: SettingsSectionId) => {
    if (isMobile) { setParams(settingsSectionParams(params, id), { state: { ...location.state, settingsSectionFrom: location.pathname + location.search } }); return; }
    const next = settingsSectionParams(params, activeSection === id ? null : id);
    next.delete('security');
    setParams(next, { replace: true, state: location.state });
  };
  const openAppearancePanel = (id: 'system-grey' | 'appearance') => {
    const next = new URLSearchParams(params);
    if (!isMobile && appearancePanel === id) next.delete('panel'); else next.set('panel', id);
    setParams(next, isMobile ? { state: { ...location.state, settingsSectionFrom: location.pathname + location.search } } : { replace: true, state: location.state });
  };
  const goBack = () => {
    if (!isMobile) { props.onBack(); return; }
    if (!section && !sharedLanding) { props.onBack(); return; }
    const previousParams = appearancePanel && !sharedLanding ? new URLSearchParams(params) : settingsSectionParams(params, null);
    if (appearancePanel && !sharedLanding) previousParams.delete('panel');
    if (sharedReadOnly) previousParams.delete('security');
    const indexParams = previousParams.toString();
    const indexPath = location.pathname + (indexParams ? `?${indexParams}` : '');
    const canUseHistory = !sharedLanding || (section === 'about' && params.get('security') !== '1');
    if (canUseHistory && location.state?.settingsSectionFrom === indexPath && window.history.state?.idx > 0) navigate(-1);
    else setParams(previousParams, { replace: true, state: location.state });
  };
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

  if (isMobile && sharedLanding) return <div className="settings-page" data-settings-section="about">
    <header className="settings-page-header">
      <button type="button" onClick={goBack} aria-label="Back to Settings" className="settings-back"><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button>
      <h1>About Portalink</h1>
    </header>
    <div className="settings-page-sections">
      <ProfessionalEntry embedded ready={!auth.isInitializing} onSignIn={() => auth.requestAuth('signIn')} onCreate={() => auth.requestAuth('signUp')} />
    </div>
  </div>;

  if (isMobile && accountSecurityOpen) return <AccountSecurityPage key={auth.user?.id ?? 'guest'} onBack={() => {
    if (location.state?.accountSecurityReturn && window.history.state?.idx > 0) { nav.back(); return; }
    const next = new URLSearchParams(params);
    next.delete('security');
    setParams(next, { replace: true, state: location.state });
  }} />;

  return <div className="settings-page" data-settings-inline={!isMobile ? 'true' : undefined} data-settings-section={activeSection ?? undefined}>
    <header className="settings-page-header">
      <button type="button" onClick={goBack} aria-label={!isMobile ? 'Back' : appearancePanel ? 'Back to Appearance' : section ? 'Back to Settings' : 'Back'} className="settings-back"><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button>
      <h1>{!isMobile ? 'Settings' : appearancePanel === 'system-grey' ? 'System grey' : section ? sectionTitles[section] : 'Settings'}</h1>
    </header>
    <div className="settings-page-sections">
      <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="appearance" title="Appearance" subtitle="Theme, accent colour, layout">
        {props.appearanceError ? <p role="alert">{props.appearanceError} <button type="button" onClick={props.onRetryAppearance} className="settings-text-action">Try again</button></p> : props.appearanceSaving ? <p role="status" className="settings-appearance-saving">Saving website colors…</p> : null}
        <NavigationButtonsPanel {...props} inline={!isMobile} selectedSection={appearancePanel} onSectionOpen={openAppearancePanel} />
      </SettingsSection>
      {!sharedReadOnly && <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="account" title="Account" subtitle="Profile, security, log out, delete account">
        {auth.isAuthenticated ? <>
          <Button variant="secondary" onClick={props.onOpenProfile}><span className="settings-action-label">View profile</span></Button>
          {auth.viewerProfileId && <Button variant="secondary" onClick={nav.profileEditor}><span className="settings-action-label">Edit profile</span></Button>}
          <Button variant="secondary" aria-expanded={!isMobile ? accountSecurityOpen : undefined} aria-controls={!isMobile ? 'settings-account-security-content' : undefined} onClick={() => {
            const next = new URLSearchParams(params);
            if (!isMobile && accountSecurityOpen) next.delete('security'); else next.set('security', '1');
            setParams(next, isMobile ? { state: { ...location.state, accountSecurityReturn: true } } : { replace: true, state: location.state });
          }}><span className="settings-action-label">Account security</span></Button>
          <Button variant="secondary" disabled={signingOut || auth.phase === 'signing-out'} onClick={() => void handleSignOut()}><span className="settings-action-label">{signingOut ? 'Logging out…' : 'Log out'}</span></Button>
          <Button variant="secondary" onClick={() => setDeletingAccount(true)}><span className="settings-action-label">Delete account…</span></Button>
          {signOutError && <p role="alert">Unable to log out. Please try again.</p>}
        </> : !isMobile && accountSecurityOpen ? null : <><Button onClick={() => auth.requestAuthenticatedDestination({ kind: 'my-profile' }, 'signIn')}><span className="settings-action-label">Sign in</span></Button><Button variant="secondary" onClick={() => auth.requestAuth('signUp')}><span className="settings-action-label">Create account</span></Button></>}
        {!isMobile && accountSecurityOpen && <div id="settings-account-security-content" className="settings-inline-security"><AccountSecurityPage key={auth.user?.id ?? 'guest'} onBack={() => {
          const next = new URLSearchParams(params); next.delete('security');
          setParams(next, { replace: true, state: location.state });
        }} /></div>}
      </SettingsSection>}
      <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="invite" title="Invite a friend" subtitle="Share Portalink with others">
        <Button variant="secondary" onClick={() => void inviteFriend()}><span className="settings-action-label">Share invite link</span></Button>
        <Button variant="secondary" onClick={() => void copyInvite()}><span className="settings-action-label">Copy invite link</span></Button>
        {inviteStatus !== 'idle' && <p role="status">{inviteStatus === 'copied' ? 'Invite link copied.' : 'Unable to share the invite link. Please try again.'}</p>}
      </SettingsSection>
      {!sharedReadOnly && <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="privacy" title="Privacy" subtitle="Data, permissions, visibility">
        <p>Manage your account visibility in Edit profile and who can message you in Message settings.</p>
        {auth.viewerProfileId && <Button variant="secondary" onClick={nav.profileEditor}><span className="settings-action-label">Account visibility</span></Button>}
        <Button variant="secondary" onClick={() => openAccountRoute('messages')}><span className="settings-action-label">Open messages</span></Button>
      </SettingsSection>}
      {!sharedReadOnly && <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="notifications" title="Notifications" subtitle="Messages, requests, updates">
        <Button variant="secondary" onClick={() => openAccountRoute('notifications')}><span className="settings-action-label">View notifications</span></Button>
      </SettingsSection>}
      <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="language" title="Language" subtitle="App language and region">
        <p>Portalink is currently available in English.</p>
      </SettingsSection>
      <SettingsSection active={activeSection} inline={!isMobile} onOpen={openSection} id="about" title="About" subtitle="Version, legal and more">
        {sharedReadOnly && !isMobile ? <ProfessionalEntry embedded ready={!auth.isInitializing} onSignIn={() => auth.requestAuth('signIn')} onCreate={() => auth.requestAuth('signUp')} /> : <><p>Portalink Networks</p><p>Web app</p></>}
        {isMobile && <MobileHomeScreenInstall />}
      </SettingsSection>
    </div>
    {!sharedReadOnly && deletingAccount && <DeleteAccountDialog isOpen onClose={() => setDeletingAccount(false)} />}
  </div>;
}
