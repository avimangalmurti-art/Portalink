import React from 'react';
import { ChevronLeftIcon, Globe2Icon, HomeIcon, UserSearchIcon, UserRoundIcon, MessageCircleIcon, WarehouseIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { buildPath } from '../../app/routes';
import { toLocationId } from '../../utils/location';
import type { ProjectView } from '../../types/domain';
import { ProjectCover } from '../media/ProjectCover';
import { getProjectAspectRatio, getProjectCoverPreview } from '../../utils/projectPresentation';
import { JustifiedImageWall } from '../profile/JustifiedImageWall';
import { guestPreviewProjects } from '../../features/discovery/guestPreview';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import './guest-home-preview.css';

const GuestWorld = React.lazy(() => import('../PortalinkPage').then(module => ({ default: module.PortalinkPage })));
const GuestAccountSearch = React.lazy(() => import('../SearchAccountsPage').then(module => ({ default: module.SearchAccountsPage })));
export type GuestBrowseView = 'home' | 'world' | 'search' | 'profile';

export function GuestHomePreview({ projects, loading, error, onRetry, onCreate, onSignIn, onOpenProject, scrollRef, onScroll,
  view = 'home', query = '', onViewChange, onQueryChange, onOpenCreator, onRequireSignIn }: {
  projects: readonly ProjectView[]; loading: boolean; error?: string | null; onRetry: () => void;
  onCreate: () => void; onSignIn: () => void; onOpenProject: (view: ProjectView) => void;
  scrollRef: React.RefObject<HTMLDivElement>; onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  view?: GuestBrowseView; query?: string; onViewChange?: (view: GuestBrowseView) => void; onQueryChange?: (query: string) => void;
  onOpenCreator?: (id: string) => void; onRequireSignIn?: (path: string, label: string) => void;
}) {
  const requireSignIn = (path: string, label: string) => onRequireSignIn ? onRequireSignIn(path, label) : onSignIn();
  const preview = guestPreviewProjects(projects);
  const items = preview.map(({ project, ...rest }, index) => {
    const ratio = getProjectAspectRatio(project);
    return { key: project.id, ratio, content: <article data-project-preview="" className="project-preview-card explore-feed-card">
      <div className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: ratio, height: 'var(--project-cover-height, auto)' }}>
        <button type="button" data-preview-open="" className="guest-home-project project-preview-artwork" onClick={() => onOpenProject({ project, ...rest })} aria-label={`Sign in to open ${project.title}`}>
          <ProjectCover source={project.cover} previewSource={getProjectCoverPreview(project)} thumbnail={project.coverThumbnail}
            kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} alt={project.title} aspectRatio={ratio} fit="cover" priority={index < 6}
            allowPdfFallback={false} allowVideoFallback={false} sizes="(max-width: 639px) 50vw, 500px" />
        </button>
      </div>
    </article> };
  });
  const navigation = [
    { id: 'home', label: 'Home', icon: HomeIcon, run: () => onViewChange?.('home') },
    { id: 'world', label: 'Open globe search', icon: Globe2Icon, run: () => onViewChange?.('world') },
    { id: 'search', label: 'Search accounts', icon: UserSearchIcon, run: () => onViewChange?.('search') },
    { id: 'messages', label: 'Messages', icon: MessageCircleIcon, run: () => requireSignIn(buildPath('messages'), 'read your messages') },
    { id: 'studio', label: 'Studio', icon: WarehouseIcon, run: () => requireSignIn(buildPath('studio'), 'open Studio') },
    { id: 'profile', label: 'Your profile', icon: UserRoundIcon, run: () => onViewChange?.('profile') },
  ];
  return <section className="guest-home-preview" aria-label="Browse Portalink as a guest" data-guest-home="" data-guest-view={view}>
    <header className="guest-home-header">
      <a href="/?welcome=1" aria-label="Back to Portalink company home"><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /><span>Back</span></a>
      <span className="guest-home-brand">Portalink</span>
      <button type="button" onClick={onSignIn}>Sign in</button>
    </header>
    <nav className="guest-browse-navigation" aria-label="Guest navigation">
      {navigation.map(item => <button type="button" key={item.id} aria-label={item.label} title={item.label} aria-current={view === item.id ? 'page' : undefined} onClick={item.run}><InterfaceIcon icon={item.icon} /></button>)}
    </nav>
    {view === 'home' ? <div ref={scrollRef} onScroll={onScroll} className="guest-home-scroll">
      <h1 id="home-work-title" className="sr-only">Home</h1>
      {loading && !preview.length ? <LoadingState kind="grid" columns={4} label="Loading public Home projects" /> : null}
      {error ? <ErrorState title="Home preview could not be loaded" description="Check your connection and try again." onRetry={onRetry} /> : null}
      {!loading && !error && !preview.length ? <EmptyState title="No public projects yet" description="Public work will appear here when it is shared." /> : null}
      <div className="guest-home-grid">
        <JustifiedImageWall items={items} columns={4} label="Public Home preview" allowLayoutControls={false} allowZoom={false} />
      </div>
    </div> : <div ref={scrollRef} className="guest-browse-content">
      <React.Suspense fallback={<LoadingState label={view === 'world' ? 'Opening globe…' : 'Opening search…'} />}>
        {view === 'world' ? <GuestWorld embedded onBack={() => onViewChange?.('home')} onSelectCity={city => requireSignIn(buildPath('location', { locationId: 'id' in city ? city.id : toLocationId(city.name) }), 'explore this city')} />
          : view === 'search' ? <GuestAccountSearch guestPreview query={query} onQueryChange={value => onQueryChange?.(value)} onBack={() => onViewChange?.('home')}
            onOpenCreator={id => onOpenCreator ? onOpenCreator(id) : requireSignIn(buildPath('profile', { profileId: id }), 'explore this creator')} />
          : <section className="guest-empty-profile" aria-labelledby="guest-profile-title">
            <header><span className="guest-profile-avatar" aria-hidden="true"><InterfaceIcon icon={UserRoundIcon} /></span><div><h1 id="guest-profile-title">Your profile</h1><p>Make room for your work.</p></div>
              <button type="button" aria-label="Profile actions" onClick={() => requireSignIn(buildPath('profileEditor'), 'manage your profile')}><InterfaceIcon icon={MoreHorizontalIcon} /></button></header>
            <div className="guest-profile-counts" aria-label="Profile overview"><span>0 projects</span><span>0 portals</span><span>0 followers</span><span>0 following</span></div>
            <div className="guest-profile-tabs"><span aria-current="page">Catalogue</span><button type="button" onClick={() => requireSignIn(buildPath('profileEditor'), 'open your Timeline')}>Timeline</button></div>
            <button type="button" className="guest-profile-first-project" onClick={() => requireSignIn(buildPath('studio'), 'publish a project')}><InterfaceIcon icon={PlusIcon} /><span>Add your first project</span></button>
          </section>}
      </React.Suspense>
    </div>}
    <aside className="guest-home-invitation" aria-label="Join Portalink">
      <div><h2>Access the network</h2>
        <button type="button" className="guest-home-create" onClick={onCreate}>Create account</button>
        <button type="button" className="guest-home-signin" onClick={onSignIn}>Already have an account? Sign in</button>
      </div>
    </aside>
  </section>;
}
