import React, { useState } from 'react';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { sourceImages } from '../../data/sourceImages';
import { usePresentation } from '../../presentation/usePresentation';
import { CatalogWelcome } from './CatalogWelcome';
import './professional-entry.css';

const preview = [
  { image: sourceImages.mechanicalPencil, title: 'Object studies' },
  { image: sourceImages.alcatrazFacade, title: 'Photography' },
  { image: sourceImages.typeSpecimen, title: 'Typography' },
  { image: sourceImages.beamCentreLoad, title: 'Structures' },
  { image: sourceImages.glitchDoNotTouch, title: 'Poster experiments' },
  { image: sourceImages.disciplinesVenn, title: 'Research & connections' },
];

const characters = [
  '/onboarding/welcome.webp', '/onboarding/process.webp', '/onboarding/portals.webp',
];

const companySections = [
  { id: 'about', title: 'About Portalink', paragraphs: ['Portalink is a home for projects, ideas and the process behind them. Build a catalogue that connects what you make with how you make it.'] },
  { id: 'mission', title: 'Mission', paragraphs: ['Give people a place to turn the things in their heads into work they can develop, build on and share.'] },
  { id: 'features', title: 'Features', paragraphs: ['Bring images, documents and video into your projects. Add context, organize related work into Portals, and present it through your catalogue and Timeline.'] },
  { id: 'how-it-works', title: 'How it works', paragraphs: ['Create your catalogue. Add a project and its content. Organize your work into Portals, then choose how you share it. Start with what you have and keep building.'] },
  { id: 'portals', title: 'Portals', paragraphs: ['Group related projects by discipline, subject or interest. Give each Portal a title and an icon so people can find their way through your catalogue.'] },
  { id: 'creators', title: 'For creators', paragraphs: ['From sketches and experiments to research and finished work: Portalink is for people who want to show both the outcome and the process.'] },
  { id: 'team', title: 'Team', paragraphs: ['A maker’s approach to building a tool for makers: thoughtful design, careful engineering and attention to the details people use every day.'] },
  { id: 'careers', title: 'Careers', paragraphs: ['Help shape tools for people who create. Portalink’s work brings product, design and engineering together.', 'No roles are listed on this page at present.'] },
  { id: 'privacy', title: 'Privacy & control', paragraphs: ['Choose account visibility and what appears on your profile, including your Timeline and citation connections. Review the available options before sharing your work.'] },
];

/** Immediate account choices; the optional brand film never gates a form. */
export function ProfessionalEntry({ ready = true, onCreate, onSignIn, onGuest }: {
  ready?: boolean; onCreate: () => void; onSignIn: () => void; onGuest: () => void;
}) {
  const [story, setStory] = useState(false);
  const mobile = usePresentation() === 'mobile';
  const createAction = <button type="button" className="professional-entry-create" data-ui-shape="action" data-keep-color="" disabled={!ready} onClick={onCreate}>Create catalogue <ArrowRight size={20} aria-hidden="true" /></button>;
  // Keep the company DOM mounted while the body-portalled story is open so
  // native disclosure state and the visitor's scroll position survive Back.
  return <main className="professional-entry professional-entry-company" aria-labelledby="professional-entry-title" aria-hidden={story || undefined} style={story ? { visibility: 'hidden' } : undefined}>
    <div className="professional-entry-frame">
      <header className="professional-entry-header">
        <span className="professional-entry-wordmark">Portalink<span aria-hidden="true">.</span></span>
        <button type="button" className="professional-entry-signin" disabled={!ready} onClick={onSignIn}>Sign in <ArrowRight size={16} aria-hidden="true" /></button>
      </header>
      <div className="professional-entry-main">
        <section className="professional-entry-copy">
          {!mobile && <p className="professional-entry-eyebrow">Projects. Process. Portals.</p>}
          <h1 id="professional-entry-title">{mobile ? 'A home for your work.' : <>A home for<br />your work.</>}</h1>
          <p className="professional-entry-description">Create, organize and share your work.</p>
          {!mobile && createAction}
          {!mobile && <div className="professional-entry-company-art" aria-hidden="true">{characters.map(src => <img key={src} src={src} alt="" width={80} height={80} decoding="async" />)}</div>}
        </section>
        <ul className="professional-entry-company-sections" aria-label="Explore Portalink and the company">
          {companySections.map((section, index) => <li key={section.id}>
            <details data-company-section={section.id}>
              <summary>
                <span className="professional-entry-company-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                <span className="professional-entry-company-title">{section.title}</span>
                <img className="professional-entry-company-character" src={characters[index % characters.length]} alt="" aria-hidden="true" width={40} height={40} draggable={false} decoding="async" />
                <ChevronDown className="professional-entry-company-chevron" size={16} aria-hidden="true" />
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
        </ul>
        {mobile && createAction}
      </div>
      <footer className="professional-entry-footer">
        <button type="button" disabled={!ready} onClick={() => setStory(true)}>Watch our story</button>
        <button type="button" disabled={!ready} onClick={onGuest}>Continue as guest <ArrowRight size={14} aria-hidden="true" /></button>
      </footer>
    </div>
    {story && <CatalogWelcome onStart={() => { setStory(false); onCreate(); }} onDismiss={() => setStory(false)} />}
  </main>;
}
