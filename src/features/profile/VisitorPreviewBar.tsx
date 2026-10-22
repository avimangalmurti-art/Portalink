import React from 'react';
import './visitor-preview.css';

export function VisitorPreviewBar({ onDone }: { onDone: () => void }) {
  return <header className="visitor-preview-bar" aria-label="Visitor preview">
    <span>Viewing as a visitor</span>
    <button type="button" data-ui-control="button" data-control-variant="secondary" data-control-size="md" onClick={onDone}>Done</button>
  </header>;
}
