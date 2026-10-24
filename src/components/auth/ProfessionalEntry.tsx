import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
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
          <p className="professional-entry-description">{mobile ? 'Organize your projects. Share your process.' : 'Organize your projects, show your process, and share your catalogue.'}</p>
          {!mobile && createAction}
        </section>
        <figure className="professional-entry-preview" aria-label="Catalogue preview of creator work">
          {!mobile && <figcaption><span>Catalogue preview</span><span>Projects & process</span></figcaption>}
          <div className="professional-entry-grid">
            {(mobile ? preview.slice(0, 3) : preview).map(({ image, title }) => <div className="professional-entry-project" key={image.id}>
              <div className="professional-entry-image"><img src={image.src} alt={image.alt} draggable={false} decoding="async" /></div>
              {!mobile && <span>{title}</span>}
            </div>)}
          </div>
        </figure>
        {mobile && createAction}
      </div>
      <footer className="professional-entry-footer">
        <button type="button" disabled={!ready} onClick={() => setStory(true)}>About Portalink</button>
        <button type="button" disabled={!ready} onClick={onGuest}>Continue as guest <ArrowRight size={14} aria-hidden="true" /></button>
      </footer>
    </div>
  </main>;
}
