import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import type { City } from '../data/cities';
import { HomeFeed } from './home/HomeFeed';
import type { Id, ProjectLocation } from '../types/domain';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { toLocationId } from '../utils/location';
type CityContentPageProps = {
  city: City;
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
  return <div className="portalink-stars relative flex h-full w-full flex-col bg-[var(--surface-canvas)]">
      <div className="ps-panel-toolbar global-control-header shrink-0 gap-3 px-2">
        <button type="button" onClick={onBack} className="shape-capsule inline-flex h-8 items-center gap-1.5 px-2.5 text-small font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
          Back
        </button>
        <h1 className="min-w-0 truncate text-small font-bold text-[var(--text-primary)]">{city.name}</h1>
      </div>
      {/* The feed owns its own scroll so it can keep loading endlessly. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HomeFeed
          key={city.name}
          isSidebarCollapsed={false}
          locationId={toLocationId(city.name)}
          onOpenProject={onOpenProject}
          onOpenCreator={onOpenCreator}
          onWarmCreator={onWarmCreator}
          scrollMemoryKey={`city:${city.name}`}
          emptyTitle={`No work is placed in ${city.name} yet`}
          emptyDescription={`Only public work from creators who choose ${city.name} as their profile city appears here.`}
        />
      </div>
    </div>;
}
