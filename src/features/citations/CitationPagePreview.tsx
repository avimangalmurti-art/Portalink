import React, { useState } from 'react';
import { PdfPage } from '../../components/media/PdfPage';
import type { CitationItem } from './model';

export default function CitationPagePreview({ item }: { item: CitationItem }) {
  const [failed, setFailed] = useState(false);
  const label = `${item.projectTitle}, Page ${item.number}`;
  return item.documentSourceUrl && !failed
    ? <PdfPage source={item.documentSourceUrl} pageNumber={item.number} label={label} onRenderFailure={() => setFailed(true)} />
    : <figure>{item.coverSourceUrl && <img src={item.coverSourceUrl} alt={`${item.projectTitle} cover`} />}<figcaption>{label} — page preview unavailable</figcaption></figure>;
}
