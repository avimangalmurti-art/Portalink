import React from 'react';
import { ArrowRight, BriefcaseBusiness, ChevronRight, Compass, Info, LayoutGrid, LogIn, Palette, PanelsTopLeft, Route, ShieldCheck, SunMoon, UserPlus, Users } from 'lucide-react';
import { sourceImages } from '../../data/sourceImages';
import { usePresentation } from '../../presentation/usePresentation';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { useDeviceAppearance } from '../../hooks/useDeviceAppearance';
import { findNavAccent, resolveNavButtonTokens } from '../../data/navButtonTokens';
import { resolveAccentTokens } from '../../utils/accentTokens';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import { MobileOnboardingAppearance } from './MobileOnboarding';
import './professional-entry.css';

const preview = [
  { image: sourceImages.mechanicalPencil, title: 'Object studies' },
  { image: sourceImages.alcatrazFacade, title: 'Photography' },
  { image: sourceImages.typeSpecimen, title: 'Typography' },
  { image: sourceImages.beamCentreLoad, title: 'Structures' },
  { image: sourceImages.glitchDoNotTouch, title: 'Poster experiments' },
  { image: sourceImages.disciplinesVenn, title: 'Research & connections' },
];

const companySections = [
  { id: 'about', title: 'About Portalink', icon: Info, paragraphs: ['Portalink is a home for projects, ideas and the process behind them. Build a catalogue that connects what you make with how you make it.'] },
  { id: 'mission', title: 'Mission', icon: Compass, paragraphs: ['Give people a place to turn the things in their heads into work they can develop, build on and share.'] },
  { id: 'features', title: 'Features', icon: LayoutGrid, paragraphs: ['Bring images, documents and video into your projects. Add context, organize related work into Portals, and present it through your catalogue and Timeline.'] },
  { id: 'how-it-works', title: 'How it works', icon: Route, paragraphs: ['Create your catalogue. Add a project and its content. Organize your work into Portals, then choose how you share it. Start with what you have and keep building.'] },
  { id: 'portals', title: 'Portals', icon: PanelsTopLeft, paragraphs: ['Group related projects by discipline, subject or interest. Give each Portal a title and an icon so people can find their way through your catalogue.'] },
  { id: 'creators', title: 'For creators', icon: Palette, paragraphs: ['From sketches and experiments to research and finished work: Portalink is for people who want to show both the outcome and the process.'] },
  { id: 'team', title: 'Team', icon: Users, paragraphs: ['A maker’s approach to building a tool for makers: thoughtful design, careful engineering and attention to the details people use every day.'] },
  { id: 'careers', title: 'Careers', icon: BriefcaseBusiness, paragraphs: ['Help shape tools for people who create. Portalink’s work brings product, design and engineering together.', 'No roles are listed on this page at present.'] },
  { id: 'privacy', title: 'Privacy & control', icon: ShieldCheck, paragraphs: ['Choose account visibility and what appears on your profile, including your Timeline and citation connections. Review the available options before sharing your work.'] },
];

/** Company information and immediate account choices. */
export function ProfessionalEntry({ ready = true, onCreate, onSignIn, onGuest }: {
  ready?: boolean; onCreate: () => void; onSignIn: () => void; onGuest: () => void;
}) {
  const presentation = usePresentation(), mobile = presentation === 'mobile';
  const appearance = useDeviceAppearance(presentation);
  const { theme, highContrast, reduceTranslucency, systemGray } = appearance;
  const selectedAccent = findNavAccent(appearance.accentColor)[theme];
  return <main className={`professional-entry professional-entry-company${mobile ? ` theme-${theme}${highContrast ? ' high-contrast' : ''}${reduceTranslucency ? ' reduce-translucency' : ''}` : ''}`}
    data-entry-theme={mobile ? theme : undefined} data-entry-contrast={mobile ? highContrast : undefined} data-entry-solid={mobile ? reduceTranslucency : undefined}
    style={mobile ? { ...resolveAccentTokens(selectedAccent, theme), ...resolveNavButtonTokens(theme, selectedAccent, highContrast, reduceTranslucency, systemGray) } : undefined}
    aria-labelledby="professional-entry-title">
    <div className="professional-entry-frame">
      <div className="professional-entry-main">
        <section className="professional-entry-copy" aria-label="Portalink Networks Inc.">
          <div className="professional-entry-company-card">
            <div className="professional-entry-wordmark">
              {mobile ? <div className="professional-entry-avatar" data-profile-avatar-host="">
                <ProfileAvatar name="Portalink Networks Inc." avatar="/icons/portalink-app-512-62b9d2e7.png" size="profile" priority inlinePreview />
              </div> : <img className="professional-entry-logo squircle" src="/icons/portalink-app-192-62b9d2e7.png" alt="" aria-hidden="true" width={68} height={68} />}
              <div className="professional-entry-brand-copy">
                <h1 id="professional-entry-title" className="professional-entry-company-name">Portalink Networks Inc.</h1>
                {!mobile && <p className="professional-entry-description">Create, organize and share your work.</p>}
              </div>
            </div>
          </div>
          <div className="professional-entry-account-actions" role="group" aria-label="Account options">
            <button type="button" className="professional-entry-create" data-keep-color="" disabled={!ready} onClick={onCreate}>
              {mobile ? <><span className="professional-entry-company-icon" aria-hidden="true"><UserPlus size={20} strokeWidth={1.9} /></span><span className="professional-entry-company-title">Create account</span><ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" /></> : <>Create account <ArrowRight size={16} aria-hidden="true" /></>}
            </button>
            <button type="button" className="professional-entry-signin" disabled={!ready} onClick={onSignIn}>
              {mobile ? <><span className="professional-entry-company-icon" aria-hidden="true"><LogIn size={20} strokeWidth={1.9} /></span><span className="professional-entry-company-title">Sign in</span><ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" /></> : <>Sign in <ArrowRight size={16} aria-hidden="true" /></>}
            </button>
          </div>
          {!mobile && <p className="professional-entry-eyebrow">Projects. Process. Portals.</p>}
        </section>
        <ul className="professional-entry-company-sections" aria-label="Explore Portalink and the company">
          {companySections.map(section => <li key={section.id}>
            <details data-company-section={section.id}>
              <summary>
                <span className="professional-entry-company-icon" aria-hidden="true"><section.icon size={20} strokeWidth={1.9} /></span>
                <span className="professional-entry-company-title">{section.title}</span>
                <ChevronRight className="professional-entry-company-chevron" size={18} aria-hidden="true" />
              </summary>
              <div className="professional-entry-company-panel" role="region" aria-label={section.title}>
                {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                {section.id === 'features' && <figure className="professional-entry-preview" aria-label="Catalogue preview of creator work">
                  <figcaption><span>Catalogue preview</span><span>Projects & process</span></figcaption>
                  <div className="professional-entry-grid">
                    {(mobile ? preview.slice(0, 3) : preview).map(({ image, title }) => <div className="professional-entry-project" key={image.id}>
                      <div className="professional-entry-image"><img src={image.src} alt={image.alt} draggable={false} decoding="async" loading="lazy" /></div>
                      <span>{title}</span>
                    </div>)}
                  </div>
                </figure>}
              </div>
            </details>
          </li>)}
          {mobile && <li className="professional-entry-appearance-item">
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
              </div>
            </details>
          </li>}
        </ul>
      </div>
      <footer className="professional-entry-footer">
        <button type="button" disabled={!ready} onClick={onGuest}>Continue as guest <ArrowRight size={14} aria-hidden="true" /></button>
      </footer>
    </div>
  </main>;
}
