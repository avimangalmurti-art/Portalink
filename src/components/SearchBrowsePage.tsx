import React, { useEffect, useState } from 'react';
import type { Id, ProjectLocation } from '../types/domain';
import { toLocationId } from '../utils/location';
import { locationDirectory, type DirectoryPlace } from '../data/locationDirectory';
import type { LiveSessionsState } from '../features/live/useLiveSessions';
import { PortalinkPage } from './PortalinkPage';
import { CityContentPage } from './CityContentPage';
import { EmptyState, LoadingState } from './ui/StateViews';
import { usePresentation } from '../presentation/usePresentation';

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
  onReturnHome?: () => void;
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
  onOpenWorld,
  onReturnHome,
  onOpenLocation
}: SearchBrowsePageProps) {
  const isMobile = usePresentation() === 'mobile';
  const [resolved, setResolved] = useState<{ id: string; place: DirectoryPlace | null; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (view !== 'location' || !locationId) return;
    let current = true;
    void locationDirectory.resolve(locationId).then(place => { if (current) setResolved({ id: locationId, place }); })
      .catch(() => { if (current) setResolved({ id: locationId, place: null, failed: true }); });
    return () => { current = false; };
  }, [view, locationId, attempt]);
  if (view === 'location') {
    if (!resolved || resolved.id !== locationId) return <LoadingState label="Opening location…" />;
    if (resolved.failed) return <EmptyState title="Location could not load" description="Try loading the directory again." action={{ label: 'Try again', onClick: () => { setResolved(null); setAttempt(value => value + 1); } }} />;
    const selectedCity = resolved.place;

    if (!selectedCity) {
      return (
        <div className="flex h-full w-full items-center justify-center px-6 py-10">
          <EmptyState
            title="Location not found"
            description="Return to Portalink and choose another place."
            action={{ label: 'Browse another city', onClick: onOpenWorld }}
          />
        </div>
      );
    }

    return (
      <CityContentPage
        city={selectedCity}
        onBack={onOpenWorld}
        onOpenProject={onOpenProject}
        onOpenCreator={onOpenCreator}
        onWarmCreator={onWarmCreator}
      />
    );
  }

  if (view === 'world') {
    return (
      <PortalinkPage
        onBack={onReturnHome ?? onOpenAtlas}
        onSelectCity={(city) => onOpenLocation('id' in city ? city.id : toLocationId(city.name))}
        live={live}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-10">
      <EmptyState title="Search" description="Portalink Search is being designed." action={!isMobile ? { label: 'Explore the world', onClick: onOpenWorld } : undefined} />
    </div>
  );
}
