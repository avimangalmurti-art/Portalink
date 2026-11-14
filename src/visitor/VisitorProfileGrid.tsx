import { LoadingSkeleton } from '../components/ui/StateViews';
import { DensitySeparator } from '../components/ui/DensitySeparator';
import { EmployerOverview } from '../features/employer/EmployerOverview';
import { JourneyToggle } from '../features/journey/JourneyToggle';
import { useJourneySelection } from '../features/journey/useJourneySelection';
import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MoonIcon, SunIcon } from 'lucide-react';
import type { Profile } from '../types/domain';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { AppearanceSwitch } from '../components/ui/AppearanceSwitch';
import { InterfaceIcon } from '../components/ui/InterfaceIcon';
import { PlatformGrid } from '../components/profile/PlatformGrid';
import { JustifiedImageWall } from '../components/profile/JustifiedImageWall';
import { ProjectPreviewCard } from '../components/profile/ProjectPreviewCard';
import { getProjectAspectRatio } from '../utils/projectPresentation';
import { resolveProfileLinks } from '../features/profile/profileLinks';
import { useProjectGridDensity } from '../features/profile/useProjectGridDensity';
import { buildPath } from '../app/routes';
import { useAuth } from '../contexts/AuthContext';
import { usePresentation } from '../presentation/usePresentation';
import { useSearchParams } from 'react-router-dom';
import { observeMobileCatalogueScroll, repairMobileCatalogueScroll } from '../components/profile/mobileCatalogueScroll';
import '../components/profile/profile-header.css';
import { projectBelongsToPortal } from '../features/projects/projectPortals';

const JourneyView = lazy(() => import('../features/journey/JourneyView').then(m => ({ default: m.JourneyView })));
const ProfileBioSheet = lazy(() => import('../features/profile/ProfileBioSheet').then(module => ({ default: module.ProfileBioSheet })));
const ProfileCollectionGrid = lazy(() => import('../components/profile/ProfileCollectionGrid').then(module => ({ default: module.ProfileCollectionGrid })));

/** Read-only composition of the same identity, artwork, density and preview UI. */
export function VisitorProfileGrid({ profile, categoryId, onOpen, onCollaboration, onMessage, onBack, active = true, onCaptureOpener, appearanceControls }: {
  profile: Profile; categoryId: string | null; onOpen: (categoryId: string, projectId: string) => void; onCollaboration: () => void; onMessage: () => void; onBack?: () => void;
  active?: boolean; onCaptureOpener?: React.MouseEventHandler<HTMLDivElement>;
  appearanceControls?: {
    theme: 'light' | 'dark';
    onThemeChange: (theme: 'light' | 'dark') => void;
    highContrast: boolean; reduceTranslucency: boolean;
    onHighContrastChange: (enabled: boolean) => void;
    onReduceTranslucencyChange: (enabled: boolean) => void;
  };
}) {
  const [bioOpen, setBioOpen] = useState(false);
  useEffect(() => { if (!active) setBioOpen(false); }, [active]);
  const auth = useAuth();
  const isMobile = usePresentation() === 'mobile';
  const journey = useJourneySelection(profile.id, auth.viewerProfileId, false);
  const [search, setSearch] = useSearchParams();
  const portalsView = !categoryId && search.get('view') === 'portals';
  const isJourney = profile.showJourney === true && journey.view === 'journey' && !categoryId && !portalsView;
  const profilePageRef = useRef<HTMLDivElement>(null);
  const imageCatalogue = active && !isJourney && !portalsView;
  const mobileImageCatalogue = isMobile && imageCatalogue;
  // React 18 does not forward the boolean inert attribute; use the DOM property.
  useLayoutEffect(() => { if (profilePageRef.current) profilePageRef.current.inert = !active; }, [active]);
  useLayoutEffect(() => {
    if (!mobileImageCatalogue) return;
    repairMobileCatalogueScroll(profilePageRef.current);
    return observeMobileCatalogueScroll(profilePageRef.current);
  }, [mobileImageCatalogue, profile.id, categoryId]);
  const [timelineToolbarHost, setTimelineToolbarHost] = useState<HTMLDivElement | null>(null);
  const category = profile.categories.find(item => item.id === categoryId);
  const density = useProjectGridDensity(profile, false, 'public-catalogue');
  const projects = useMemo(() => categoryId ? profile.projects.filter(project => projectBelongsToPortal(project, categoryId)) : profile.projects, [profile.projects, categoryId]);
  const contentGutter = !isMobile && imageCatalogue && projects.length > 0 ? 'px-[12px]' : 'px-[var(--content-gutter)]';
  const links = resolveProfileLinks(profile.links, profile.socialLinks);
  const items = projects.map(project => ({ key: project.id, ratio: getProjectAspectRatio(project), content:
    <ProjectPreviewCard active={active} project={project} creator={profile} onOpen={() => onOpen(categoryId ?? project.categoryId, project.id)}
      creatorHref={buildPath('sharedProfile', { profileId: profile.id })} showCreator={false} showEngagementMetrics={false}
      priority="viewport" allowPdfFallback={false} allowVideoFallback={true} sharedCoverFallback /> }));
  return <div ref={profilePageRef} hidden={!active} aria-hidden={!active || undefined}
    style={!active ? { display: 'none' } : undefined} onClickCapture={isMobile && active ? onCaptureOpener : undefined}
    data-web-profile-header={!isMobile ? '' : undefined} data-profile-journey={isJourney ? '' : undefined} data-public-image-catalogue={mobileImageCatalogue ? '' : undefined} data-profile-page="" data-public-portfolio-grid="" className="user-profile-canvas flex min-h-full w-full flex-col text-[var(--text-primary)]">
    <div data-profile-header="" className="profile-header-region contents">
      <header className="profile-compact-header" data-expanded>
        <div className="profile-identity-and-links flex w-full min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
          <div className="profile-identity-main flex min-w-0 max-w-full items-center gap-2.5">
            <ProfileAvatar name={profile.name} avatar={profile.avatar} size="profile" priority="viewport" />
            <div className="profile-identity-copy flex min-w-0 flex-col justify-center">
              <h1 tabIndex={isMobile ? -1 : undefined} className="cdx-panel-title min-w-0 truncate font-semibold" title={profile.name}>{profile.name}</h1>
              {profile.location && <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.2] text-[var(--text-secondary)]">{profile.location}</p>}
              {profile.showJourney === true && (isMobile || (!categoryId && !portalsView)) && <div className="profile-identity-view"><JourneyToggle view={!categoryId && !portalsView ? journey.view : 'portfolio'} onChange={view => {
                journey.select(view);
                if (categoryId) onBack?.();
                else if (portalsView) setSearch(previous => { const next = new URLSearchParams(previous); next.delete('view'); return next; });
              }} /></div>}
            </div>
          </div>
        </div>
        {appearanceControls && <div className={`public-profile-appearance-controls flex shrink-0 ${isMobile ? 'items-center gap-1' : 'flex-col'}`} role="group" aria-label="Catalogue appearance">
          {isMobile && <button type="button" data-ui-control="icon" data-control-size="md" data-control-variant="ghost" data-system-color=""
            aria-label={appearanceControls.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={() => appearanceControls.onThemeChange(appearanceControls.theme === 'dark' ? 'light' : 'dark')}>
            <InterfaceIcon icon={appearanceControls.theme === 'dark' ? SunIcon : MoonIcon} size="md" />
          </button>}
          <AppearanceSwitch label="High Contrast" isOn={appearanceControls.highContrast}
            onToggle={() => appearanceControls.onHighContrastChange(!appearanceControls.highContrast)} />
          {!isMobile && <AppearanceSwitch label="Translucency" isOn={!appearanceControls.reduceTranslucency}
            onToggle={() => appearanceControls.onReduceTranslucencyChange(!appearanceControls.reduceTranslucency)} />}
        </div>}
      </header>
      {!isJourney && <header id="profile-navigation-tools" className="user-profile-canvas ps-panel-toolbar global-control-header profile-navigation-header side-panel-content-inset relative z-20 w-full">
        <div className="side-panel-control-row w-full min-w-0 flex-wrap">
          <div data-mobile-profile-links="" className="w-full min-w-0 basis-full"><PlatformGrid links={links} profileName={profile.name} isSharedView onOpenBio={() => setBioOpen(true)} onCollaboration={onCollaboration}
            onMessage={onMessage} profileAudio={{ profileId: profile.id, accountId: auth.user?.id ?? null, profileAvatar: profile.avatar, editable: false, active: active && !auth.isInitializing && !categoryId && !portalsView }} /></div>
        </div>
      </header>}
      {isMobile && isJourney && <div className="timeline-header-controls" ref={setTimelineToolbarHost} />}
      {imageCatalogue && <DensitySeparator columns={density.columns} onChange={density.setColumns} onPreview={density.previewColumns} label="Projects per row" />}
    </div>
    {active && bioOpen && <Suspense fallback={null}><ProfileBioSheet profileId={profile.id} bio={profile.headline} canEdit={false} onClose={() => setBioOpen(false)} /></Suspense>}
    {!categoryId && !portalsView && <EmployerOverview profile={profile} onOpen={project => onOpen(project.categoryId,project.id)} />}
    <div id="profile-content" className={`min-w-0 w-full pb-4 ${contentGutter}`}>
      {category && <header className="side-panel-control-row my-3"><button type="button" onClick={onBack} data-ui-control="button" data-control-size="md" data-control-variant="secondary">Back to profile</button><h2 className="min-w-0 truncate px-2 font-semibold">{category.label}</h2></header>}
      {isJourney ? <Suspense fallback={<LoadingSkeleton kind="journey" label="Opening Timeline…"/>}><JourneyView active={active} toolbarHost={isMobile ? timelineToolbarHost : null} profile={profile} owner={false} showPopular={false} onOpen={project => onOpen(project.categoryId, project.id)} /></Suspense> : portalsView ? <Suspense fallback={<LoadingSkeleton kind="rows" label="Opening portals…"/>}><ProfileCollectionGrid shared profileId={profile.id} kind="portals" portals={profile.categories} people={[]} loading={false} error={null} hasMore={false} onLoadMore={() => undefined} /></Suspense>
        : projects.length ? <JustifiedImageWall label={`${profile.name} — profile imagery`} columns={density.columns} onColumnsChange={density.setColumns} allowLayoutControls={false} items={items} />
        : <p className="px-3 py-10 text-[var(--text-secondary)]">No published projects here yet.</p>}
    </div>
  </div>;
}
