import React from 'react';
import { ChevronLeftIcon } from 'lucide-react';
import type { ProjectView } from '../../types/domain';
import { ProjectCover } from '../media/ProjectCover';
import { getProjectAspectRatio, getProjectCoverPreview } from '../../utils/projectPresentation';
import { JustifiedImageWall } from '../profile/JustifiedImageWall';
import { guestPreviewProjects } from '../../features/discovery/guestPreview';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import './guest-home-preview.css';

export function GuestHomePreview({ projects, loading, error, onRetry, onCreate, onSignIn, onOpenProject, scrollRef, onScroll }: {
  projects: readonly ProjectView[]; loading: boolean; error?: string | null; onRetry: () => void;
  onCreate: () => void; onSignIn: () => void; onOpenProject: (view: ProjectView) => void;
  scrollRef: React.RefObject<HTMLDivElement>; onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}) {
  const preview = guestPreviewProjects(projects);
  const items = preview.map(({ project, ...rest }, index) => {
    const ratio = getProjectAspectRatio(project);
    return { key: project.id, ratio, content: <article data-project-preview="" className="project-preview-card explore-feed-card">
      <div className="project-card-frame individual-content-outline relative w-full" style={{ aspectRatio: ratio, height: 'var(--project-cover-height, auto)' }}>
        <button type="button" data-preview-open="" className="guest-home-project project-preview-artwork" onClick={() => onOpenProject({ project, ...rest })} aria-label={`Create an account to open ${project.title}`}>
          <ProjectCover source={project.cover} previewSource={getProjectCoverPreview(project)} thumbnail={project.coverThumbnail}
            kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} alt={project.title} aspectRatio={ratio} fit="cover" priority={index < 6}
            allowPdfFallback={false} allowVideoFallback={false} sizes="(max-width: 639px) 50vw, 500px" />
        </button>
      </div>
    </article> };
  });
  return <section className="guest-home-preview" aria-labelledby="home-work-title" data-guest-home="">
    <header className="guest-home-header">
      <a href="/?welcome=1" aria-label="Back to Portalink company home"><InterfaceIcon icon={ChevronLeftIcon} mirroredInRtl /><span>Back</span></a>
      <span className="guest-home-brand">Portalink</span>
      <button type="button" onClick={onSignIn}>Sign in</button>
    </header>
    <div ref={scrollRef} onScroll={onScroll} className="guest-home-scroll">
      <h1 id="home-work-title" className="sr-only">Home</h1>
      {loading && !preview.length ? <LoadingState kind="grid" columns={4} label="Loading public Home projects" /> : null}
      {error ? <ErrorState title="Home preview could not be loaded" description="Check your connection and try again." onRetry={onRetry} /> : null}
      {!loading && !error && !preview.length ? <EmptyState title="No public projects yet" description="Public work will appear here when it is shared." /> : null}
      <div className="guest-home-grid">
        <JustifiedImageWall items={items} columns={4} label="Public Home preview" allowLayoutControls={false} allowZoom={false} />
      </div>
    </div>
    <aside className="guest-home-invitation" aria-label="Join Portalink">
      <div><h2>Access the network</h2>
        <button type="button" className="guest-home-create" onClick={onCreate}>Create account</button>
        <button type="button" className="guest-home-signin" onClick={onSignIn}>Already have an account? Sign in</button>
      </div>
    </aside>
  </section>;
}
