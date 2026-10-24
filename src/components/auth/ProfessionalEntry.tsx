import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
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
  { image: { id: 'portalink-world', src: '/onboarding/welcome.webp', alt: 'Portalink character holding the Earth' }, title: 'Keep your projects together' },
  { image: { id: 'portalink-process', src: '/onboarding/process.webp', alt: 'Portalink character holding a process book' }, title: 'Show your process' },
  { image: { id: 'portalink-portals', src: '/onboarding/portals.webp', alt: 'Portalink character holding a Portals folder' }, title: 'Organize work into Portals' },
];

/** Immediate account choices; the optional brand film never gates a form. */
export function ProfessionalEntry({ ready = true, onCreate, onSignIn, onGuest }: {
  ready?: boolean; onCreate: () => void; onSignIn: () => void; onGuest: () => void;
}) {
  const [story, setStory] = useState(false);
  const mobile = usePresentation() === 'mobile';
  if (story) return <CatalogWelcome onStart={() => { setStory(false); onCreate(); }} onDismiss={() => setStory(false)} />;
  const createAction = <button type="button" className="professional-entry-create" data-ui-shape="action" data-keep-color="" disabled={!ready} onClick={onCreate}>Create catalogue <ArrowRight size={20} aria-hidden="true" /></button>;
  return <main className="professional-entry" aria-labelledby="professional-entry-title">
    <div className="professional-entry-frame">
      <header className="professional-entry-header">
        <span className="professional-entry-wordmark">Portalink<span aria-hidden="true">.</span></span>
        <button type="button" className="professional-entry-signin" disabled={!ready} onClick={onSignIn}>Sign in <ArrowRight size={16} aria-hidden="true" /></button>
      </header>
      <div className="professional-entry-main">
        <section className="professional-entry-copy">
          {!mobile && <p className="professional-entry-eyebrow">Projects. Process. Portals.</p>}
          <h1 id="professional-entry-title">A home for<br />your work.</h1>
          <p className="professional-entry-description">{mobile ? <>Organize your projects. <br />Share your process.</> : 'Organize your projects, show your process, and share your catalogue.'}</p>
          {!mobile && createAction}
        </section>
        {mobile ? <ul className="professional-entry-benefits" aria-label="What you can do with Portalink">
          {characters.map(({ image, title }) => <li key={image.id}>
            <span className="professional-entry-benefit-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            <span>{title}</span>
            <img src={image.src} alt={image.alt} width={64} height={64} draggable={false} decoding="async" />
          </li>)}
        </ul> : <figure className="professional-entry-preview" aria-label="Catalogue preview of creator work">
          <figcaption><span>Catalogue preview</span><span>Projects & process</span></figcaption>
          <div className="professional-entry-grid">
            {preview.map(({ image, title }) => <div className="professional-entry-project" key={image.id}>
              <div className="professional-entry-image"><img src={image.src} alt={image.alt} draggable={false} decoding="async" /></div>
              <span>{title}</span>
            </div>)}
          </div>
        </figure>}
        {mobile && createAction}
      </div>
      <footer className="professional-entry-footer">
        <button type="button" disabled={!ready} onClick={() => setStory(true)}>About Portalink</button>
        <button type="button" disabled={!ready} onClick={onGuest}>Continue as guest <ArrowRight size={14} aria-hidden="true" /></button>
      </footer>
    </div>
  </main>;
}
