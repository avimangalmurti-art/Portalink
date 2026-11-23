import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';
import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { placeLabel, type DirectoryPlace } from '../data/locationDirectory';
import { HomeFeed } from './home/HomeFeed';
import type { Id, ProjectLocation } from '../types/domain';
import { InterfaceIcon } from './ui/InterfaceIcon';
type CityContentPageProps = {
  city: DirectoryPlace;
  onBack: () => void;
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
};

// A city opens straight into the standard content feed, scoped to that place.
export function CityContentPage({
  city,
  onBack,
  onOpenProject,
  onOpenCreator,
  onWarmCreator
}: CityContentPageProps) {
  // A Portalink network page, so the stars are drawn here rather than by the feed
  // it hosts — the same feed on Home carries no sky of its own.
  return <div data-city-page="" className="portalink-stars relative flex h-full w-full flex-col bg-[var(--surface-canvas)]">
      <div data-city-header="" data-mobile-safe-header="" className="ps-panel-toolbar global-control-header side-panel-content-inset shrink-0">
        <ScreenBack><button type="button" onClick={onBack} aria-label="Back to World"
          data-ui-control="icon" data-ui-shape="icon" data-control-size="md" data-control-variant="ghost"
          className="mobile-city-back side-panel-primary-control side-panel-control-row text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
        </button></ScreenBack>
        <h1 className="min-w-0 truncate text-small font-bold text-[var(--text-primary)]" title={placeLabel(city)}>{placeLabel(city)}</h1>
      </div>
      {/* MOBILE uses document scrolling; WEB keeps its contained feed. */}
      <div data-city-feed="" className="min-h-0 flex-1 overflow-y-auto">
        <HomeFeed
          key={city.id}
          isSidebarCollapsed={false}
          locationId={city.id}
          onOpenProject={onOpenProject}
          onOpenCreator={onOpenCreator}
          onWarmCreator={onWarmCreator}
          scrollMemoryKey={`city:${city.id}`}
          emptyTitle={`No work is placed in ${city.name} yet`}
          emptyDescription={`Public work from creators who choose a profile location in ${city.name} appears here.`}
          emptyAction={{ label: 'Browse another city', onClick: onBack }}
        />
      </div>
    </div>;
}
