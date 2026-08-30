import React, { useMemo, useState } from 'react';
import { CheckIcon, SparklesIcon } from 'lucide-react';
import { useDiscover } from '../../features/discovery/useDiscover';
import type { Id, ProjectLocation } from '../../types/domain';
import type { ExplorationMode, RankedProjectView } from '../../types/discovery';
import { getProjectAspectRatio } from '../../utils/projectPresentation';
import { ProjectCover } from '../media/ProjectCover';
import { CreatorAvatar } from '../profile/CreatorAvatar';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ErrorState, LoadingState } from '../ui/StateViews';
import { projectContinuityStyle } from '../../utils/projectContinuity';

type DiscoveryOverviewProps = {
  onOpenProject: (projectId: Id, location?: ProjectLocation) => void;
  onOpenCreator: (creatorId: Id) => void;
};

const MODES: Array<{ id: ExplorationMode; label: string }> = [
  { id: 'close', label: 'Stay close' },
  { id: 'broaden', label: 'Broaden' },
  { id: 'different', label: 'Something different' },
];

function DiscoveryCard({
  view,
  onOpenProject,
  onOpenCreator,
  onShowMore,
}: DiscoveryOverviewProps & { view: RankedProjectView; onShowMore: (projectId: Id) => Promise<void> }) {
  const [signalState, setSignalState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { project, creator } = view;
  return <article className="feed-card group min-w-[220px] max-w-[320px] flex-1 overflow-hidden">
    <button type="button" onClick={() => onOpenProject(project.id, { profileId: creator.id, categoryId: project.categoryId })} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]" aria-label={`Open ${project.title} by ${creator.name}`}>
      <span data-project-continuity-surface="" data-project-continuity-id={project.id} className="feed-card__preview block w-full overflow-hidden" style={{ aspectRatio: getProjectAspectRatio(project), ...projectContinuityStyle(project.id) }}>
        <ProjectCover source={project.cover} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} aspectRatio={getProjectAspectRatio(project)} sizes="320px" />
      </span>
      <span className="block truncate px-2 pt-2 text-[12.5px] font-semibold text-[var(--text-primary)]">{project.title}</span>
    </button>
    <div className="px-2 pb-2.5">
      <button type="button" onClick={() => onOpenCreator(creator.id)} className="mt-1 flex max-w-full items-center gap-1.5 rounded-[7px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" aria-label={`Open ${creator.name}'s profile`}>
        <CreatorAvatar name={creator.name} avatar={creator.avatar} className="h-5 w-5 text-[9px]" />
        <span className="truncate text-[11px] text-[var(--text-secondary)]">{creator.name}</span>
      </button>
      <p className="mt-1.5 min-h-[30px] text-[10.5px] leading-snug text-[var(--text-tertiary)]">{view.discovery.reason.label}</p>
      <button type="button" disabled={signalState === 'saving' || signalState === 'saved'} onClick={async () => {
        setSignalState('saving');
        try {
          await onShowMore(project.id);
          setSignalState('saved');
        } catch {
          setSignalState('error');
        }
      }} className="mt-1.5 inline-flex items-center gap-1 rounded-[7px] text-[10.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-70">
        {signalState === 'saved' ? <InterfaceIcon icon={CheckIcon} size="sm" weight="medium" /> : null}
        {signalState === 'saving' ? 'Saving…' : signalState === 'saved' ? 'Added to this exploration' : signalState === 'error' ? 'Try “show me more” again' : 'Show me more like this'}
      </button>
    </div>
  </article>;
}

function RecommendationSection({
  title,
  description,
  items,
  ...props
}: DiscoveryOverviewProps & {
  title: string;
  description: string;
  items: RankedProjectView[];
  onShowMore: (projectId: Id) => Promise<void>;
}) {
  return <section className="mt-7" aria-labelledby={`discovery-${title.replace(/\s+/g, '-').toLowerCase()}`}>
    <h2 id={`discovery-${title.replace(/\s+/g, '-').toLowerCase()}`} className="text-[15px] font-semibold text-[var(--portalink-text-primary)]">{title}</h2>
    <p className="mt-0.5 text-[11px] text-[var(--portalink-text-secondary)]">{description}</p>
    {items.length > 0 ? <div className="scrollbar-hidden mt-3 flex gap-2 overflow-x-auto pb-1">
      {items.map((view) => <DiscoveryCard key={view.project.id} view={view} {...props} />)}
    </div> : <p className="mt-3 rounded-[10px] border border-[var(--portalink-border-subtle)] px-3 py-4 text-[11px] text-[var(--portalink-text-secondary)]">No visible work falls in this part of your sphere yet.</p>}
  </section>;
}

export function DiscoveryOverview(props: DiscoveryOverviewProps) {
  const [mode, setMode] = useState<ExplorationMode>('broaden');
  const discovery = useDiscover(mode);
  const topics = useMemo(() => Object.entries(discovery.sections?.sphere.topicWeights ?? {}).sort((left, right) => right[1] - left[1]).slice(0, 5).map(([topic]) => topic.replace(/-/g, ' ')), [discovery.sections]);

  if (discovery.phase === 'loading' && !discovery.sections) return <LoadingState label="Building your content sphere" />;
  if (discovery.phase === 'error') return <ErrorState title="Discover could not be loaded" description={discovery.error ?? undefined} onRetry={discovery.retry} />;
  if (!discovery.sections) return null;

  return <div className="border-b border-[var(--portalink-border-subtle)] pb-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <InterfaceIcon icon={SparklesIcon} size="md" weight="medium" className="text-[var(--accent-text)]" />
          <h1 className="text-[17px] font-semibold text-[var(--portalink-text-primary)]">Recommended work</h1>
        </div>
        <p className="mt-1 max-w-[680px] text-[11px] leading-relaxed text-[var(--portalink-text-secondary)]">
          {topics.length > 0 ? `Currently shaped by ${topics.join(', ')}.` : 'This starts broad and becomes more useful from follows, saves, your projects, and explicit “show me more” choices.'}
          {' '}Opening a project by itself does not change your sphere.
        </p>
      </div>
      <div className="flex rounded-[9px] border border-[var(--portalink-border-subtle)] p-0.5" aria-label="Exploration distance">
        {MODES.map((item) => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => setMode(item.id)} className={`rounded-[7px] px-2.5 py-1.5 text-[10.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portalink-focus-ring)] ${mode === item.id ? 'bg-[var(--portalink-surface-hover)] text-[var(--accent-text)]' : 'text-[var(--portalink-text-secondary)] hover:text-[var(--accent-text)]'}`}>{item.label}</button>)}
      </div>
    </div>
    <RecommendationSection title="Your World" description="Close to sustained interests, relationships, and relevant places." items={discovery.sections.yourWorld} onShowMore={discovery.recordCuriosity} {...props} />
    <RecommendationSection title="Just Outside Your World" description="Related work with enough distance to add a new direction." items={discovery.sections.adjacent} onShowMore={discovery.recordCuriosity} {...props} />
    <RecommendationSection title="Explore Something Different" description="A bounded set beyond your usual sphere, selected for curiosity rather than popularity." items={discovery.sections.outside} onShowMore={discovery.recordCuriosity} {...props} />
  </div>;
}
