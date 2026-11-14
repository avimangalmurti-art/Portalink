import React from 'react';
import { ChevronDownIcon, ChevronLeftIcon, Grid2X2Icon, ListIcon, PlusIcon } from 'lucide-react';
import type { PortfolioCategory } from '../../types/domain';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { getCategoryIcon } from './categoryIcons';
import { PreviewCreatorName } from './PreviewCreatorName';
import { usePresentation } from '../../presentation/usePresentation';
import { useMobileScreenActive } from '../../presentation/mobile/MobileBackNavigation';
import { PortalLinkCopyButton } from './PortalLinkCopyButton';

export type MobileProjectSort = 'recent' | 'title' | 'saved';

/** Mobile browsing controls; authoring callbacks are supplied only for the owner. */
export function MobilePortalProjectToolbar({ category, onBack, onCreate, layout, onLayout,
  sort, onSort, sharedReadOnly = false, browsingControls = !sharedReadOnly, backLabel, publicProfileId }: {
  category: PortfolioCategory; onBack: () => void; onCreate?: () => void;
  layout: 'list' | 'grid'; onLayout: (value: 'list' | 'grid') => void;
  sort: MobileProjectSort; onSort: (value: MobileProjectSort) => void;
  sharedReadOnly?: boolean;
  /** Local sorting and view controls do not grant authoring permissions. */
  browsingControls?: boolean;
  backLabel?: string;
  /** Only supplied in the owner's workspace for a publicly visible Portal. */
  publicProfileId?: string;
}) {
  const isMobile = usePresentation() === 'mobile';
  const active = useMobileScreenActive();
  const categoryIcon = <InterfaceIcon icon={getCategoryIcon(category.iconName)} size="lg" className="mobile-portal-index-icon" />;
  return <header className="mobile-portal-index-toolbar">
    <div className={`mobile-portal-index-heading${isMobile ? ' !grid grid-cols-[44px_minmax(0,1fr)_44px]' : ''}`}>
      <button type="button" onClick={onBack} aria-label={backLabel ?? (sharedReadOnly ? 'Back to profile' : 'Back to portals')} className="mobile-portal-index-control">
        <InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl />
      </button>
      {!isMobile && categoryIcon}
      <h2 title={category.label} className={isMobile ? 'flex items-center justify-center gap-2' : undefined}>
        {isMobile ? <>{categoryIcon}<PreviewCreatorName name={category.label} active={active} centered className="block !flex-initial [font:inherit]" /></> : category.label}
      </h2>
      {onCreate && <button type="button" onClick={onCreate} aria-label={`Add a new project to ${category.label}`} className="mobile-portal-index-control">
        <InterfaceIcon icon={PlusIcon} size="lg" />
      </button>}
    </div>
    {browsingControls && <div className="mobile-portal-index-preferences">
      <label className="mobile-portal-index-control mobile-portal-index-layout mobile-portal-index-sort">
        <span aria-hidden="true">{sort === 'recent' ? 'Recent' : sort === 'title' ? 'Name' : 'Saved order'}</span>
        <InterfaceIcon icon={ChevronDownIcon} size="sm" />
        <select value={sort} aria-label="Sort projects" onChange={event => onSort(event.target.value as MobileProjectSort)}>
          <option value="recent">Recent</option><option value="title">Name</option><option value="saved">Saved order</option>
        </select>
      </label>
      {publicProfileId && <div className="flex min-w-0 flex-1 justify-center">
        <PortalLinkCopyButton key={`${publicProfileId}:${category.id}`} profileId={publicProfileId} categoryId={category.id} />
      </div>}
      <div className="mobile-portal-index-view-controls">
        <button type="button" className="mobile-portal-index-control mobile-portal-index-layout" aria-label={layout === 'list' ? 'Show project grid' : 'Show project list'} aria-pressed={layout === 'grid'} onClick={() => onLayout(layout === 'list' ? 'grid' : 'list')}>
          <InterfaceIcon icon={layout === 'list' ? Grid2X2Icon : ListIcon} />
        </button>
      </div>
    </div>}
  </header>;
}
