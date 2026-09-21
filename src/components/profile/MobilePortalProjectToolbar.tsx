import React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, Grid2X2Icon, ListIcon, PlusIcon } from 'lucide-react';
import type { PortfolioCategory } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { getCategoryIcon } from './categoryIcons';
import { MAX_PAGES_PER_ROW, MIN_PAGES_PER_ROW } from '../../features/projects/pageLayout';

export type MobileProjectSort = 'recent' | 'title' | 'saved';

/** Mobile browsing controls; authoring callbacks are supplied only for the owner. */
export function MobilePortalProjectToolbar({ category, onBack, onCreate, layout, onLayout,
  sort, onSort, pagesPerRow, canAdjustPages, savingPages, onPagesChange, onPagesCommit }: {
  category: PortfolioCategory; onBack: () => void; onCreate?: () => void;
  layout: 'list' | 'grid'; onLayout: (value: 'list' | 'grid') => void;
  sort: MobileProjectSort; onSort: (value: MobileProjectSort) => void;
  pagesPerRow: number; canAdjustPages: boolean; savingPages: boolean;
  onPagesChange: (value: number) => void; onPagesCommit: (value: number) => void;
}) {
  return <header className="mobile-portal-index-toolbar">
    <div className="mobile-portal-index-heading">
      <button type="button" onClick={onBack} aria-label="Back to portals" className="mobile-portal-index-control">
        <InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl />
      </button>
      <InterfaceIcon icon={getCategoryIcon(category.iconName)} size="lg" className="mobile-portal-index-icon" />
      <h2 title={category.label}>{category.label}</h2>
      {onCreate && <button type="button" onClick={onCreate} aria-label={`Add a new project to ${category.label}`} className="mobile-portal-index-control">
        <InterfaceIcon icon={PlusIcon} size="lg" />
      </button>}
    </div>
    <div className="mobile-portal-index-preferences">
      <label className="mobile-portal-index-sort">
        <select value={sort} aria-label="Sort projects" onChange={event => onSort(event.target.value as MobileProjectSort)}>
          <option value="recent">Recent</option><option value="title">Name</option><option value="saved">Saved order</option>
        </select><InterfaceIcon icon={ChevronDownIcon} size="sm" />
      </label>
      <div className="mobile-portal-index-view-controls">
        <button type="button" className="mobile-portal-index-control mobile-portal-index-layout" aria-label={layout === 'list' ? 'Show project grid' : 'Show project list'} aria-pressed={layout === 'grid'} onClick={() => onLayout(layout === 'list' ? 'grid' : 'list')}>
          <InterfaceIcon icon={layout === 'list' ? Grid2X2Icon : ListIcon} />
        </button>
        {canAdjustPages && <label className="mobile-portal-index-density">
          <span>Pages/row <span className="mobile-portal-index-page-count">{pagesPerRow}</span></span>
          <input data-pages-per-row-slider="" type="range" min={MIN_PAGES_PER_ROW} max={MAX_PAGES_PER_ROW} step={1} value={pagesPerRow} disabled={savingPages}
            onChange={event => onPagesChange(Number(event.currentTarget.value))}
            onPointerUp={event => onPagesCommit(Number(event.currentTarget.value))}
            onKeyUp={event => onPagesCommit(Number(event.currentTarget.value))}
            onBlur={event => onPagesCommit(Number(event.currentTarget.value))}
            aria-label="Pages per row" aria-valuetext={`${pagesPerRow} ${pagesPerRow === 1 ? 'page' : 'pages'} per row`} />
        </label>}
      </div>
    </div>
  </header>;
}
