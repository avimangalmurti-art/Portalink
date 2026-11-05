import React, { useRef } from 'react';
import { BriefcaseBusiness, ChevronRight, Compass, DoorOpen, Info, LayoutGrid, LogIn, Palette, Route, ShieldCheck, SunMoon, UserPlus, Users } from 'lucide-react';
import { usePresentation } from '../../presentation/usePresentation';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { useDeviceAppearance } from '../../hooks/useDeviceAppearance';
import { findNavAccent, resolveNavButtonTokens } from '../../data/navButtonTokens';
import { resolveAccentTokens } from '../../utils/accentTokens';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import { MobileOnboardingAppearance } from './MobileOnboarding';
import { CityClock } from './CityClock';
import './professional-entry.css';

const teamMembers = [
  { name: 'aviwashere', image: '/team/aviwashere-299d5a86e64f.jpg', width: 905, height: 1280 },
  { name: 'VennCo', image: '/team/vennco-b0888d06a92c.jpg', width: 1024, height: 1280 },
];

const companySections = [
  { id: 'about', title: 'About Portalink', icon: Info,
    intro: 'Portalink is a interplanetary technology company best known for its Interplanetary Core Network Command (ICNC).',
    overview: [
      { label: 'Core identity', detail: 'Interplanetary Core Network Command (ICNC).' },
      { label: 'Network', detail: 'People, projects and knowledge connected across worlds.' },
      { label: 'Platform', detail: 'A professional platform for developing, organizing and sharing projects.' },
      { label: 'Core mission', detail: 'Give people the tools to create work that changes the world.' },
    ] },
  { id: 'mission', title: 'Mission', icon: Compass,
    intro: 'A place to turn the things in your head into work you can develop, build on and share.',
    overview: [
      { label: 'Purpose', detail: 'Give ideas and work a place to develop.' },
      { label: 'Process', detail: 'Show how a project takes shape alongside its outcome.' },
      { label: 'Sharing', detail: 'Let people choose how they present their work.' },
    ] },
  // Keep Features text-only unless the user explicitly requests images again.
  { id: 'features', title: 'Features', icon: LayoutGrid,
    intro: 'Tools for presenting projects and the context behind them.',
    overview: [
      { label: 'Projects', detail: 'Bring images, documents and video into your projects.' },
      { label: 'Context', detail: 'Add descriptions and supporting material to explain your work.' },
      { label: 'Organization', detail: 'Group related work into Portals.' },
      { label: 'Presentation', detail: 'Share work through your catalogue and Timeline.' },
    ] },
  { id: 'how-it-works', title: 'How it works', icon: Route,
    intro: 'Build your catalogue one project at a time.',
    overview: [
      { label: 'Create', detail: 'Set up your account and profile.' },
      { label: 'Add', detail: 'Create a project and add its content.' },
      { label: 'Organize', detail: 'Place related projects in Portals.' },
      { label: 'Share', detail: 'Choose how your work appears and who can see it.' },
    ] },
  { id: 'portals', title: 'Portals', icon: DoorOpen,
    intro: 'Portals bring related projects together within your catalogue.',
    overview: [
      { label: 'Grouping', detail: 'Organize by discipline, subject or interest.' },
      { label: 'Identity', detail: 'Give each Portal a title and an icon.' },
      { label: 'Navigation', detail: 'Help visitors find and browse related projects.' },
    ] },
  { id: 'creators', title: 'For creators', icon: Palette,
    intro: 'A place to show both the result and the work behind it.',
    overview: [
      { label: 'Work', detail: 'Sketches, experiments, research and finished projects.' },
      { label: 'Context', detail: 'Present the thinking and process behind your work.' },
      { label: 'Continuity', detail: 'Keep developing your catalogue as your work grows.' },
    ] },
  { id: 'team', title: 'Team', icon: Users },
  { id: 'careers', title: 'Careers', icon: BriefcaseBusiness,
    intro: 'Help shape tools for people who create.',
    overview: [
      { label: 'Areas of work', detail: 'Product, design and engineering.' },
      { label: 'Current openings', detail: 'No roles are listed on this page at present.' },
      { label: 'Mission', detail: 'Build useful tools for people who create.' },
    ] },
  { id: 'privacy', title: 'Privacy & control', icon: ShieldCheck,
    intro: 'Choose what appears on your profile before sharing your work.',
    overview: [
      { label: 'Visibility', detail: 'Manage your account’s visibility.' },
      { label: 'Timeline', detail: 'Choose whether to show your Timeline publicly.' },
      { label: 'Citations', detail: 'Choose whether to show what you cite and who cites you.' },
    ] },
] as const;

/** Company information and immediate account choices. */
export function ProfessionalEntry({ ready = true, embedded = false, onCreate, onSignIn }: {
  ready?: boolean; embedded?: boolean; onCreate: () => void; onSignIn: () => void;
}) {
  const Container = embedded ? 'section' : 'main';
  const CompanyHeading = embedded ? 'h2' : 'h1';
  const presentation = usePresentation();
  const previewHost = useRef<HTMLElement>(null);
  const appearance = useDeviceAppearance(presentation);
  const { theme, highContrast, reduceTranslucency, systemGray } = appearance;
  const selectedAccent = findNavAccent(appearance.accentColor)[theme];
  const companyCard = <div className="professional-entry-company-card">
    <div className="professional-entry-wordmark">
      <div className="professional-entry-avatar">
        <ProfileAvatar name="Portalink Networks Inc." avatar="/icons/portalink-app-512-62b9d2e7.png" videoSrc="/company/avatar-loop-098c2e5d5e1e.mp4" size="profile" priority inlinePreview previewHost={previewHost} />
      </div>
      <div className="professional-entry-brand-copy">
        <CompanyHeading id="professional-entry-title" className="professional-entry-company-name">Portalink Networks Inc.</CompanyHeading>
        <CityClock />
      </div>
    </div>
  </div>;
  const accountActions = <div className="professional-entry-account-actions" role="group" aria-label="Account options">
    <button type="button" className="professional-entry-create" data-keep-color="" disabled={!ready} onClick={onCreate}>
      <span className="professional-entry-company-icon" aria-hidden="true"><UserPlus size={20} strokeWidth={1.9} /></span><span className="professional-entry-company-title">Create account</span><ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" />
    </button>
    <button type="button" className="professional-entry-signin" disabled={!ready} onClick={onSignIn}>
      <span className="professional-entry-company-icon" aria-hidden="true"><LogIn size={20} strokeWidth={1.9} /></span><span className="professional-entry-company-title">Sign in</span><ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" />
    </button>
  </div>;
  const appearanceSection = <ul className="professional-entry-company-sections professional-entry-appearance-sections" aria-label="Appearance options">
    <li className="professional-entry-appearance-item">
      <details data-entry-appearance="">
        <summary>
          <span className="professional-entry-company-icon" aria-hidden="true"><SunMoon size={20} strokeWidth={1.9} /></span>
          <span className="professional-entry-company-title">Appearance</span>
          <ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" />
        </summary>
        <div className="professional-entry-company-panel professional-entry-appearance" role="region" aria-label="Appearance settings">
          <fieldset><legend>Appearance</legend>
            <div className="professional-entry-modes" role="radiogroup" aria-label="Appearance" onKeyDown={handleRadioGroupKeyDown}>
              {(['auto', 'light', 'dark'] as const).map(mode => <button key={mode} type="button" role="radio" aria-checked={appearance.mode === mode} tabIndex={appearance.mode === mode ? 0 : -1} onClick={() => appearance.chooseMode(mode)}>{mode === 'auto' ? 'System' : mode === 'light' ? 'Light' : 'Dark'}</button>)}
            </div>
          </fieldset>
          <MobileOnboardingAppearance idPrefix="entry" showPreview={false} theme={theme} systemGray={systemGray}
            onSystemGrayChange={value => appearance.chooseAppearance({ systemGray: value })} accentColor={appearance.accentColor}
            onAccentColorChange={value => appearance.chooseAppearance({ accentColor: value })} highContrast={highContrast}
            onHighContrastChange={value => appearance.chooseAppearance({ highContrast: value })} reduceTranslucency={reduceTranslucency}
            onReduceTranslucencyChange={value => appearance.chooseAppearance({ reduceTranslucency: value })} />
          {highContrast && <p className="professional-entry-appearance-note" role="status">High contrast strengthens text and borders.</p>}
        </div>
      </details>
    </li>
  </ul>;
  const companyItems = companySections.map(section => <li key={section.id}>
    <details data-company-section={section.id}>
      <summary>
        <span className="professional-entry-company-icon" aria-hidden="true"><section.icon size={20} strokeWidth={1.9} /></span>
        <span className="professional-entry-company-title">{section.title}</span>
        <ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="professional-entry-company-panel" role="region" aria-label={section.title}>
        {section.id === 'team' ? <ul className="professional-entry-team" aria-label="Team members">
          {teamMembers.map(member => <li key={member.name}>
            <figure>
              <div className="professional-entry-team-image">
                <img src={member.image} alt="" width={member.width} height={member.height} loading="lazy" decoding="async" />
              </div>
              <figcaption>{member.name}</figcaption>
            </figure>
          </li>)}
        </ul> : <>
          <p>{section.intro}</p>
          <h2 className="professional-entry-overview-title">Key Overview</h2>
          <ul className="professional-entry-company-points">
            {section.overview.map(point => <li key={point.label}><strong>{point.label}:</strong> {point.detail}</li>)}
          </ul>
        </>}
      </div>
    </details>
  </li>);
  return <Container ref={previewHost} data-profile-avatar-host="" data-entry-embedded={embedded || undefined} className={`professional-entry professional-entry-company theme-${theme}${highContrast ? ' high-contrast' : ''}${reduceTranslucency ? ' reduce-translucency' : ''}`}
    data-entry-theme={theme} data-entry-contrast={highContrast} data-entry-solid={reduceTranslucency}
    style={{ ...resolveAccentTokens(selectedAccent, theme), ...resolveNavButtonTokens(theme, selectedAccent, highContrast, reduceTranslucency, systemGray) }}
    aria-labelledby="professional-entry-title">
    <div className="professional-entry-frame">
      <div className="professional-entry-mobile-header">{companyCard}</div>
      <div className="professional-entry-main">
        <section className="professional-entry-copy" aria-label="Portalink Networks Inc.">
          <div className="professional-entry-account-settings" role="group" aria-label="Account and appearance options">
            {accountActions}
            {appearanceSection}
          </div>
        </section>
        <div className="professional-entry-company-groups" role="group" aria-label="Explore Portalink and the company">
          <ul className="professional-entry-company-sections professional-entry-company-group" aria-label="About Portalink and the platform">{companyItems.slice(0, 6)}</ul>
          <ul className="professional-entry-company-sections professional-entry-company-group" aria-label="Team, careers and privacy">{companyItems.slice(6)}</ul>
        </div>
      </div>
    </div>
  </Container>;
}
