import { EmployerOverview } from '../features/employer/EmployerOverview';
import { JourneyToggle } from '../features/journey/JourneyToggle';
import { useJourneySelection } from '../features/journey/useJourneySelection';
import React, { lazy, Suspense, useMemo, useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';
import type { Profile } from '../types/domain';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { PlatformGrid } from '../components/profile/PlatformGrid';
import { JustifiedImageWall } from '../components/profile/JustifiedImageWall';
import { ProjectPreviewCard } from '../components/profile/ProjectPreviewCard';
import { InterfaceIcon } from '../components/ui/InterfaceIcon';
import { getProjectAspectRatio } from '../utils/projectPresentation';
import { resolveProfileLinks } from '../features/profile/profileLinks';
import { useProjectGridDensity } from '../features/profile/useProjectGridDensity';
import { buildPath } from '../app/routes';
import { useAuth } from '../contexts/AuthContext';
import { usePresentation } from '../presentation/usePresentation';
import { useSearchParams } from 'react-router-dom';
import '../components/profile/profile-header.css';

const JourneyView = lazy(() => import('../features/journey/JourneyView').then(m => ({ default: m.JourneyView })));
const ProfileBioSheet = lazy(() => import('../features/profile/ProfileBioSheet').then(module => ({ default: module.ProfileBioSheet })));
const ProfileCollectionGrid = lazy(() => import('../components/profile/ProfileCollectionGrid').then(module => ({ default: module.ProfileCollectionGrid })));

/** Read-only composition of the same identity, artwork, density and preview UI. */
export function VisitorProfileGrid({ profile, categoryId, onOpen, onCollaboration, onMessage, onBack }: {
  profile: Profile; categoryId: string | null; onOpen: (categoryId: string, projectId: string) => void; onCollaboration: () => void; onMessage: () => void; onBack?: () => void;
}) {
  const [optionsOpen, setOptionsOpen] = useState(false), [bioOpen, setBioOpen] = useState(false);
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const journey = useJourneySelection(profile.id, auth.viewerProfileId);
  const [search] = useSearchParams();
  const portalsView = !categoryId && search.get('view') === 'portals';
  const category = profile.categories.find(item => item.id === categoryId);
  const density = useProjectGridDensity(profile, false);
  const projects = useMemo(() => categoryId ? profile.projects.filter(project => project.categoryId === categoryId) : profile.projects, [profile.projects, categoryId]);
  const links = resolveProfileLinks(profile.links, profile.socialLinks);
  const items = projects.map(project => ({ key: project.id, ratio: getProjectAspectRatio(project), content:
    <ProjectPreviewCard project={project} creator={profile} onOpen={() => onOpen(project.categoryId, project.id)}
      creatorHref={buildPath('sharedProfile', { profileId: profile.id })} showCreator={false} showEngagementMetrics={false}
      priority="viewport" allowPdfFallback={false} allowVideoFallback={false} sharedCoverFallback /> }));
  return <div data-profile-page="" data-public-portfolio-grid="" className="user-profile-canvas flex min-h-full w-full flex-col text-[var(--text-primary)]">
    <div data-profile-header="" className="profile-header-region contents">
      <header className="profile-compact-header" data-expanded={optionsOpen || undefined}>
        <div className="profile-identity-and-links flex w-full min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
          <div className="profile-identity-main flex min-w-0 max-w-full items-center gap-2.5">
            <ProfileAvatar name={profile.name} avatar={profile.avatar} size="profile" priority="viewport" />
            <div className="profile-identity-copy flex min-w-0 flex-col justify-center">
              <h1 className="cdx-panel-title min-w-0 truncate font-semibold" title={profile.name}>{profile.name}</h1>
              {profile.location && <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.2] text-[var(--text-secondary)]">{profile.location}</p>}
            </div>
          </div>
        </div>
        <button type="button" className="profile-header-options" aria-label="Profile options" aria-expanded={optionsOpen} aria-controls="profile-navigation-tools" onClick={() => setOptionsOpen(value => !value)}><InterfaceIcon icon={MoreHorizontalIcon} /></button>
      </header>
      {optionsOpen && <header id="profile-navigation-tools" className="user-profile-canvas ps-panel-toolbar global-control-header profile-navigation-header side-panel-content-inset relative z-20 w-full">
        <div className="side-panel-control-row w-full min-w-0 flex-wrap">
          {isMobile && profile.showJourney === true && !categoryId && !portalsView && <JourneyToggle view={journey.view} onChange={journey.select} />}
          <div data-mobile-profile-links="" className="w-full min-w-0 basis-full"><PlatformGrid links={links} profileName={profile.name} isSharedView onOpenBio={() => setBioOpen(true)} onCollaboration={onCollaboration}
            onMessage={onMessage} /></div>
        </div>
      </header>}
    </div>
    {bioOpen && <Suspense fallback={null}><ProfileBioSheet profileId={profile.id} bio={profile.headline} canEdit={false} onClose={() => setBioOpen(false)} /></Suspense>}
    {!categoryId && !portalsView && <EmployerOverview profile={profile} onOpen={project => onOpen(project.categoryId,project.id)} />}
    {!isMobile && profile.showJourney === true && !categoryId && !portalsView && <JourneyToggle view={journey.view} onChange={journey.select} />}
    <div id="profile-content" className="min-w-0 w-full px-[var(--content-gutter)] pb-4">
      {category && <header className="side-panel-control-row my-3"><button type="button" onClick={onBack} data-ui-control="button" data-control-size="md" data-control-variant="secondary">Back to profile</button><h2 className="min-w-0 truncate px-2 font-semibold">{category.label}</h2></header>}
      {profile.showJourney === true && journey.view === 'journey' && !categoryId && !portalsView ? <Suspense fallback={<p role="status">Opening Journey…</p>}><JourneyView profile={profile} owner={false} onOpen={project => onOpen(project.categoryId, project.id)} /></Suspense> : portalsView ? <Suspense fallback={<p role="status">Opening portals…</p>}><ProfileCollectionGrid shared profileId={profile.id} kind="portals" portals={profile.categories} people={[]} loading={false} error={null} hasMore={false} onLoadMore={() => undefined} /></Suspense>
        : projects.length ? <JustifiedImageWall label={`${profile.name} — profile imagery`} columns={density.columns} onColumnsChange={density.setColumns} allowLayoutControls={false} items={items} />
        : <p className="px-3 py-10 text-[var(--text-secondary)]">No published projects here yet.</p>}
    </div>
  </div>;
}
