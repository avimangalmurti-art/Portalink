import { plainFormattedText } from '../../components/text/textFormatting';
import { MobileProfileContext } from '../../presentation/mobile/MobileProfileContext';
import { MobileContextButton } from '../../presentation/mobile/MobileContextActions';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import React, { lazy, Suspense, useCallback, useState } from 'react';
import { ArrowLeftIcon, BookmarkIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { buildPath } from '../../app/routes';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { ActivityCollectionPage } from '../../components/profile/ActivityCollectionPage';
import { CreatorAvatar } from '../../components/profile/CreatorAvatar';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { InboxPanel } from '../../components/messages/InboxPanel';
import type { Profile, ProjectLocation } from '../../types/domain';
import { useAccountQuery } from './useAccountQuery';
import { SavedPagesCollection } from './SavedPagesCollection';
import { loadSavedCreators } from './collectionQueries';
import { usePresentation } from '../../presentation/usePresentation';

const ReadsList = lazy(() => import('../reads/ReadsView').then(module=>({default:module.ReadsList})));
const ReadsProject = lazy(() => import('../reads/ReadsView').then(module=>({default:module.ReadsProject})));
const LoadTimingInsights = lazy(() => import('./LoadTimingInsights'));
const MobileInsights = lazy(() => import('./MobileInsights').then(module => ({ default: module.MobileInsights })));

function PersonalHeader({ title, onBack, insights = false }: { title: string; onBack: () => void; insights?: boolean }) {
  const isMobile = usePresentation() === 'mobile';
  return <header className="ps-panel-toolbar global-control-header side-panel-content-inset">
    <ScreenBack visibleOnMobile={insights}><button type="button" onClick={onBack} aria-label="Go back" className="shape-compact flex h-10 w-10 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><InterfaceIcon icon={ArrowLeftIcon} mirroredInRtl /></button></ScreenBack>
    <h1 className="text-medium font-semibold text-[var(--text-primary)]">{title}</h1>
    {insights && isMobile && <div data-inline-screen-actions=""><MobileContextButton /></div>}
  </header>;
}

export function SavedPage({ onBack, onOpenProject }: { onBack: () => void; onOpenProject: (id: string, location?: ProjectLocation) => void }) {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedTab = params.get('tab');
  const tab = selectedTab === 'creators' || selectedTab === 'pages' ? selectedTab : 'projects';
  if (!auth.isAuthenticated) return null;
  return <section data-library-actions="" aria-label="Saved library">
    <PersonalHeader title="Saved" onBack={onBack} />
    <div className="px-[var(--content-gutter)] py-6">
      <p className="text-[13px] text-[var(--text-secondary)]">Your private library. Saving a creator does not follow them.</p>
      <div className="side-panel-control-row my-6 flex-wrap" role="group" aria-label="Saved collection">
        {/* Tabs are one screen: retain the URL selection without burying its entry point in history. */}
        {(['projects', 'pages', 'creators'] as const).map((kind) => <button key={kind} type="button" aria-pressed={tab === kind} onClick={() => setParams(kind === 'projects' ? {} : { tab: kind }, { replace: true })} className={`side-panel-primary-control px-4 text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${tab === kind ? 'bg-[var(--surface-selected)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>{kind === 'projects' ? 'Projects' : kind === 'pages' ? 'Pages' : 'Creators'}</button>)}
      </div>
      {tab === 'projects' ? <ActivityCollectionPage key={auth.user?.id} embedded kind="save" profileName="Your library" isViewerOwnCollection onBack={onBack} onOpenProject={onOpenProject} /> : tab === 'pages' ? <SavedPagesCollection key={auth.user?.id} /> : <SavedCreators key={auth.user?.id} />}
    </div>
  </section>;
}

function SavedCreators() {
  const navigate = useNavigate();
  const { creatorSaves, profiles } = useServices();
  const query = useCallback(() => loadSavedCreators(creatorSaves, profiles), [creatorSaves, profiles]);
  const state = useAccountQuery(query);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const items = state.data?.filter((item) => !removed.has(item.id));
  if (state.loading) return <LoadingState label="Loading saved creators" />;
  if (state.error) return <ErrorState title="Unable to load saved creators" description={state.error} onRetry={state.retry} />;
  if (!items?.length) return <EmptyState title="No saved creators yet" description="Use the bookmark on another creator’s profile to keep them here, without following." action={{ label: 'Explore the world', onClick: () => navigate(buildPath('portalink')) }} />;
  return <ul className="grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
    {items.map(({ id, profile }) => <SavedCreatorRow key={id} id={id} profile={profile} onRemoved={() => setRemoved((current) => new Set([...current, id]))} />)}
  </ul>;
}

function SavedCreatorRow({ id, profile, onRemoved }: { id: string; profile: Profile | null; onRemoved: () => void }) {
  const { creatorSaves } = useServices();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function remove() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try { await creatorSaves.setCreatorSave(id, false); onRemoved(); }
    catch { setError('Could not remove this bookmark. Please try again.'); }
    finally { setPending(false); }
  }
  return <MobileProfileContext profileId={id} name={profile?.name ?? 'Creator'} onUnsave={!pending ? remove : undefined}><li className="shape-container border border-[var(--hairline)] p-4">
    <div className="flex items-center gap-3">
      {profile ? <Link data-preview-open="" to={buildPath('profile', { profileId: id })} className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <CreatorAvatar name={profile.name} avatar={profile.avatar} shape="squircle" className="h-10 w-10 shrink-0" />
        <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{profile.name}</span><span className="block truncate text-[12px] text-[var(--text-secondary)]">{plainFormattedText(profile.headline)}</span></span>
      </Link> : <span className="flex-1 text-[13px] text-[var(--text-secondary)]">This creator is no longer available.</span>}
      <button type="button" disabled={pending} onClick={() => void remove()} aria-label={`Remove ${profile?.name ?? 'unavailable creator'} from Saved`} title="Remove from Saved" className="shape-compact flex h-10 w-10 shrink-0 items-center justify-center hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"><InterfaceIcon icon={BookmarkIcon} keepColor fill="currentColor" /></button>
    </div>
    {error && <p role="alert" className="mt-2 text-[12px] text-[var(--status-danger)]">{error}</p>}
  </li></MobileProfileContext>;
}

export function InsightsPage({ onBack }: { onBack: () => void }) {
  const isMobile = usePresentation() === 'mobile';
  const [params,setParams]=useSearchParams();const projectId=params.get('project');
  const { creatorSaves } = useServices();
  const query = useCallback(() => creatorSaves.getSaveInsights(), [creatorSaves]);
  const state = useAccountQuery(query, { key: 'insights:audience', scope: creatorSaves });
  return <section aria-label="Private creator insights" className={isMobile ? 'mobile-insights-page' : undefined}>
    <PersonalHeader insights title={projectId ? "Reads" : isMobile ? "Your insights" : "Insights"} onBack={projectId ? () => setParams({}) : onBack} />
    <div className={isMobile ? 'mobile-insights-scroll' : undefined}>{projectId ? <Suspense fallback={<LoadingState label="Loading Reads" />}><ReadsProject key={projectId} projectId={projectId}/></Suspense> : <>
    {isMobile ? <Suspense fallback={<LoadingState kind="insights" label="Loading insights" />}><MobileInsights saves={state} /></Suspense> : <div className="px-[var(--content-gutter)] py-6">
      <div className="flex items-center justify-between gap-4"><p className="text-[13px] text-[var(--text-secondary)]">Only you can see these insights.</p><button type="button" onClick={state.retry} disabled={state.loading || state.refreshing} className="shape-compact px-3 py-2 text-[13px] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Refresh</button></div>
      {state.loading ? <LoadingState kind="insights" label="Loading insights" /> : state.error ? <ErrorState title="Unable to load insights" description={state.error} onRetry={state.retry} /> : state.data ? <dl className="my-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {([
          ['Creator saves', state.data.creatorSaves, 'People who currently have your profile saved.'],
          ['Project saves', state.data.projectSaves, 'Current bookmarks of your projects by other people.'],
          ['Followers', state.data.followers, 'People following you. Pending requests are not included.'],
        ] as const).map(([label, count, description]) => <div key={label} className="shape-container border border-[var(--hairline)] p-5"><dt className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</dt><dd className="mt-3 text-[32px] font-semibold tabular-nums">{count.toLocaleString()}</dd><dd className="mt-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">{description}</dd></div>)}
      </dl> : null}
      <p className="max-w-[640px] text-[13px] leading-relaxed text-[var(--text-secondary)]">Saves recognise interest without requiring a follow. Saver identities remain private. These are current totals, so removing a save reduces the count; saving again never adds a duplicate.</p>
      <Suspense fallback={null}><ReadsList/><LoadTimingInsights /></Suspense>
    </div>}
  </>}</div></section>;
}

export function ActivityPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  return <section data-library-actions="" aria-label="Activity"><PersonalHeader title="Activity" onBack={onBack} /><InboxPanel key={user?.id} /></section>;
}
