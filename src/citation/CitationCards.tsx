import React from 'react';
import {SatelliteDishIcon} from 'lucide-react';
import type { CitationItem } from '../features/citations/model';
import { plainCitation } from '../features/citations/model';
import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import './citation-entry.css';
export function CitationCards({ item, preview, citedIn, onCopy, onCite, onShare, status, own = false }: {
  item: CitationItem; preview: React.ReactNode; citedIn?: React.ReactNode; status?: string; own?: boolean;
  onCopy: (bib: boolean) => void; onCite: () => void; onShare: () => void;
}) {
  return <div className="citation-cards">
    <header className="citation-header"><span className="citation-mark" aria-label="Portalink"><SatelliteDishIcon size={22} aria-hidden="true"/></span><h1>Citation</h1></header>
    <section className="citation-preview-card" aria-label={`${item.kind === 'page' ? 'Page' : 'Image'} ${item.number}`}>{preview}</section>
    <section className="citation-text-card" aria-label="Citation"><h2>{item.projectTitle}</h2><blockquote>{plainCitation(item, PUBLIC_ORIGIN)}</blockquote>
      <div className="citation-pill-row"><button type="button" onClick={() => onCopy(false)}>Copy plain text</button><button type="button" onClick={() => onCopy(true)}>Copy BibTeX</button></div>
    </section>
    <p className="citation-licence">{item.citable ? <>Citable. Attribution and a link to the original are required. <a href="/licenses/citable-v1">Licence</a></> : <>View only. AI retrieval or reproduction is not permitted. <a href="/licenses/view-only-v1">Licence</a></>}</p>
    {citedIn}
    <div className="citation-pill-row citation-destination-actions">{!own && <button type="button" onClick={onCite}>Cite</button>}<button type="button" onClick={onShare}>Share</button></div>
    <p className="citation-status" role="status">{status}</p>
  </div>;
}
