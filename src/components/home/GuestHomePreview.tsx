import React from 'react';
import type { ProjectView } from '../../types/domain';
import { ProjectCover } from '../media/ProjectCover';
import { getProjectCoverPreview } from '../../utils/projectPresentation';
import { guestPreviewProjects } from '../../features/discovery/guestPreview';
import { EmptyState, ErrorState, LoadingState } from '../ui/StateViews';
import './guest-home-preview.css';

export function GuestHomePreview({ projects, loading, error, onRetry, onCreate, onSignIn, onOpenProject, scrollRef, onScroll }: {
  projects: readonly ProjectView[]; loading: boolean; error?: string | null; onRetry: () => void;
  onCreate: () => void; onSignIn: () => void; onOpenProject: (view: ProjectView) => void;
  scrollRef: React.RefObject<HTMLDivElement>; onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}) {
  const preview = guestPreviewProjects(projects);
  return <section className="guest-home-preview" aria-labelledby="home-work-title" data-guest-home="">
    <header className="guest-home-header">
      <a href="/?welcome=1" aria-label="Back to Portalink company home">Portalink</a>
      <button type="button" onClick={onSignIn}>Sign in</button>
    </header>
    <div ref={scrollRef} onScroll={onScroll} className="guest-home-scroll">
      <h1 id="home-work-title" className="sr-only">Home</h1>
      {loading && !preview.length ? <LoadingState kind="grid" columns={3} label="Loading public Home projects" /> : null}
      {error ? <ErrorState title="Home preview could not be loaded" description="Check your connection and try again." onRetry={onRetry} /> : null}
      {!loading && !error && !preview.length ? <EmptyState title="No public projects yet" description="Public work will appear here when it is shared." /> : null}
      <div className="guest-home-grid" role="list" aria-label="Public Home preview">
        {preview.map(({ project, ...rest }, index) => <div role="listitem" data-project-preview="" key={project.id}>
          <button type="button" className="guest-home-project" onClick={() => onOpenProject({ project, ...rest })} aria-label={`Create an account to open ${project.title}`}>
            <span className="project-preview-artwork">
            <ProjectCover source={project.cover} previewSource={getProjectCoverPreview(project)} thumbnail={project.coverThumbnail}
              kind={project.coverKind} frame={project.coverFrame} pageNumber={project.coverPageNumber} alt={project.title} fit="contain" priority={index < 6}
              allowPdfFallback={false} allowVideoFallback={false} sizes="(max-width: 639px) 33vw, 320px" />
            </span>
          </button>
        </div>)}
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
