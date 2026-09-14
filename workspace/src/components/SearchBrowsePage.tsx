import React from 'react';
import type { Id, ProjectLocation } from '../types/domain';
import { cities } from '../data/cities';
import { toLocationId } from '../utils/location';
import type { LiveSessionsState } from '../features/live/useLiveSessions';
import { PortalinkPage } from './PortalinkPage';
import { CityContentPage } from './CityContentPage';
import { EmptyState } from './ui/StateViews';

type SearchBrowsePageProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
  onWarmCreator?: (creatorId: Id) => void;
  live: LiveSessionsState;
  view: 'atlas' | 'world' | 'location';
  locationId: Id | null;
  onOpenAtlas: () => void;
  onOpenWorld: () => void;
  onOpenLocation: (locationId: Id) => void;
};

export function SearchBrowsePage({
  onOpenProject,
  onOpenCreator,
  onWarmCreator,
  live,
  view,
  locationId,
  onOpenAtlas,
  onOpenLocation
}: SearchBrowsePageProps) {
  if (view === 'location') {
    const selectedCity = cities.find((city) => toLocationId(city.name) === locationId) ?? null;

    if (!selectedCity) {
      return (
        <div className="flex h-full w-full items-center justify-center px-6 py-10">
          <EmptyState
            title="Location not found"
            description="Return to Portalink and choose another place."
          />
        </div>
      );
    }

    return (
      <CityContentPage
        city={selectedCity}
        onBack={onOpenAtlas}
        onOpenProject={onOpenProject}
        onOpenCreator={onOpenCreator}
        onWarmCreator={onWarmCreator}
      />
    );
  }

  if (view === 'world') {
    return (
      <PortalinkPage
        onBack={onOpenAtlas}
        onSelectCity={(city) => onOpenLocation(toLocationId(city.name))}
        live={live}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-10">
      <EmptyState title="Search" description="Portalink Search is being designed." />
    </div>
  );
}
