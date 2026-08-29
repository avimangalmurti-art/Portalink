import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { InterfaceIcon } from './ui/InterfaceIcon';
type CategoryCollectionPageProps = {
  categoryName: string;
  categoryTone: string;
  onBack: () => void;
};
export function CategoryCollectionPage({
  categoryName,
  onBack
}: CategoryCollectionPageProps) {
  return <div className="category-collection-page min-h-full w-full bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header gap-3 px-[var(--content-gutter)]">
        <button type="button" onClick={onBack} aria-label="Back to browse categories" className="shape-compact flex h-9 w-9 shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
        </button>
        <h1 className="min-w-0 truncate text-large font-bold text-[var(--text-primary)]">{categoryName}</h1>
      </header>
    </div>;
}
