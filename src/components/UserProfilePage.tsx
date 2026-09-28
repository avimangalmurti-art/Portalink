import { useMenuFocus } from '../hooks/useMenuFocus';
import { SavedChangeNotice } from './ui/SavedChangeNotice';
import { ScreenBack } from '../presentation/mobile/MobileBackNavigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePresentation } from '../presentation/usePresentation';
import { useMobilePortalPopupSize } from '../presentation/mobile/useMobilePortalPopupSize';
import { useSearchParams } from 'react-router-dom';
import { buildPath } from '../app/routes';
import { ArrowLeftIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, ClockIcon, GripVerticalIcon, HandshakeIcon, HeartIcon, Loader2Icon, LockIcon, MoreHorizontalIcon, MoveIcon, PencilIcon, PlusIcon, Repeat2Icon, Settings2Icon, UserPlusIcon } from 'lucide-react';
import { useFollowRequests } from '../features/follows/useFollowRequests';
import { useProfileVisibility } from '../features/profile/useProfileVisibility';
import { SectionHeader } from './SectionHeader';
import { EmptyState } from './ui/StateViews';
import { describeActivityCollection, ENGAGEMENT_KINDS, type EngagementKind } from '../types/engagement';
import { CreatorSaveButton } from '../features/library/CreatorSaveButton';
import { PlatformGrid } from './profile/PlatformGrid';
import { JustifiedImageWall, type WallItem } from './profile/JustifiedImageWall';
import { NewCategoryDialog } from './profile/NewCategoryDialog';
import type { Profile, ProfileLink, Project } from '../types/domain';
import { canAuthor, needsAccount, type ViewerRole } from '../types/viewer';
import { getProjectAspectRatio } from '../utils/projectPresentation';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { ResponsiveImage } from './ui/ResponsiveImage';
import { ProfileAvatar } from './profile/ProfileAvatar';
import { mergeProfileLinks } from '../features/profile/profileLinks';
import { ProfileShareMenu } from './profile/ProfileShareMenu';
import { ProjectPreviewCard } from './profile/ProjectPreviewCard';
import { ProjectEditorDialog } from '../features/projects/ProjectEditorDialog';
import { useProjectManagement, type ProjectManagement } from '../features/projects/useProjectManagement';
import { useProfileProjectOrder } from '../features/profile/useProfileProjectOrder';
import { useProjectGridDensity } from '../features/profile/useProjectGridDensity';
import { MIN_PROJECT_GRID_COLUMNS, MAX_PROJECT_GRID_COLUMNS } from '../utils/projectGridDensity';
import { useReorderOutsideTap } from '../features/profile/useReorderOutsideTap';
import { useProfileConnections } from '../features/follows/useProfileConnections';
import { ProfileCollectionGrid } from './profile/ProfileCollectionGrid';
import { ProfileBioSheet } from '../features/profile/ProfileBioSheet';

/**
 * A creator's profile overview.
 *
 * Everything on this page resolves from ONE canonical profile record: the
 * identity, the audience figures, the categories, and the work itself. There is
 * no sample catalog and no stand-in identity — a profile that cannot be resolved
 * canonically is never rendered here, so this page cannot show one person's
 * chrome around another person's (or nobody's) work.
 */
type UserProfilePageProps = {
  /** The canonical record. Read through the profile data boundary, so a saved edit shows immediately. */
  profile: Profile;
  onBack: () => void;
  /** The same portal-list screen used by mobile navigation, for this profile. */
  mobilePortalsView: React.ReactElement;
  /** Keep portal and project content in the same mobile profile workspace. */
  mobileContent?: React.ReactElement;
  mobileContentView?: 'portals' | 'projects';
  /** Selected projects take over the canvas without the profile header. */
  mobileProjectSelected?: boolean;
  mobileProjectIndexOpen?: boolean;
  onMobileViewChange?: (view: ProfileContentView) => void;
  mobileWallScrollMemory?: { read: () => number; save: (top: number) => void };
  /**
   * The viewer's relationship to this profile, and the ONLY permission input this
   * component takes. It previously took `isOwner` alongside this, which meant two
   * sources for one question and the possibility of them disagreeing. Authoring is
   * now derived here with `canAuthor`, and the account gate with `needsAccount`.
   *
   * Presentation only: the service decides what a viewer may actually read or
   * write, and a real backend must enforce that independently.
   */
  viewerRole: ViewerRole;
  /**
   * The resolved follow lifecycle for this profile, owned by `useFollows` above.
   * Absent for a viewer who cannot follow.
   */
  follow?: {
    isFollowing: boolean;
    /** The viewer has asked to follow a private profile and is waiting. */
    isRequested: boolean;
    isResolving: boolean;
    resolveError: string | null;
    isPending: boolean;
    mutationError: string | null;
    onToggle: () => void;
    onRetry: (() => void) | null;
  };
  onSignInRequest?: () => void;
  /** Opens the published project represented by a profile image. */
  onOpenProject: (projectId: string, categoryId: string, options?: { openComments?: boolean }) => void;
  onEditProfile?: () => void;
  /** Existing Messages entry point, with its normal account gate. */
  onCollaboration?: () => void;
  /** Stable read-only URL intended for people who do not have an account. */
  shareUrl?: string;
  onBeforeShare?: () => Promise<void>;
  /** Removes application navigation from the public shared profile surface. */
  isSharedView?: boolean;
  /** Creates a category under the title the owner supplies. */
  onAddCategory?: (label: string, iconName?: string) => void;
  /**
   * Opens one activity collection. It is a real destination with its own URL, so
   * this navigates rather than toggling a panel inside this page — which is what
   * it used to do, leaving the collection unlinkable and lost on refresh.
   */
  onOpenActivity?: (kind: EngagementKind) => void;
};
const ACTIVITY_ICONS: Record<EngagementKind, typeof HeartIcon> = {
  like: HeartIcon,
  save: BookmarkIcon,
  repost: Repeat2Icon
};
const ACTIVITY_COLORS: Record<EngagementKind, string> = {
  like: 'var(--engagement-like-selected)',
  save: 'var(--engagement-save-selected)',
  repost: 'var(--engagement-repost-selected)'
};
// Cards never grow past this, so fewer columns leaves open canvas rather than
// blowing a single card up to fill the screen.
const MAX_CARD_WIDTH = 300;
const GRID_GAP = 4;

type InlineDescriptionEditor = {
  phase: ProjectManagement['editor']['phase'];
  value: string;
  error: string | null;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onRetry: () => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
};

function ProfileDescriptionEditor({
  projectTitle,
  editor
}: {
  projectTitle: string;
  editor: InlineDescriptionEditor;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editor.phase !== 'editing') return;
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  }, [editor.phase]);

  if (editor.phase === 'loading') {
    return <div role="status" className="absolute inset-0 z-20 flex items-center justify-center rounded-[8px] bg-[var(--control-rest-surface)] text-[12px] font-medium text-[var(--control-text)]">
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading description…
      </div>;
  }

  if (editor.phase === 'load-failed') {
    return <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[8px] bg-[var(--control-rest-surface)] p-3 text-center text-[12px] text-[var(--control-text)]">
        <p>{editor.error ?? 'This description could not be opened.'}</p>
        <span className="flex items-center gap-2">
          <button type="button" onClick={editor.onRetry} className="shape-compact h-7 bg-[var(--accent-primary)] px-2.5 font-semibold text-[var(--accent-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
          <button type="button" onClick={editor.onCancel} className="shape-compact h-7 px-2.5 font-semibold hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Cancel</button>
        </span>
      </div>;
  }

  return <form aria-label={`Edit ${projectTitle} description`} onSubmit={(event) => {
    event.preventDefault();
    void editor.onSave();
  }} className="absolute inset-0 z-20 grid grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-[8px] bg-[var(--control-rest-surface)] p-3 text-[var(--control-text)] ring-2 ring-inset ring-[var(--focus-ring)]">
      <textarea
        ref={textareaRef}
        value={editor.value}
        disabled={editor.isSaving}
        aria-label="Project description"
        aria-invalid={editor.error ? true : undefined}
        onChange={(event) => editor.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            editor.onCancel();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void editor.onSave();
          }
        }}
        className="h-full min-h-0 w-full resize-none overflow-y-auto bg-transparent p-0 text-[12px] font-medium leading-[1.45] text-[var(--accent-text)] outline-none disabled:opacity-70"
      />
      <div className="flex min-w-0 items-center gap-2 border-t border-[var(--control-border)] pt-2 text-[10px] font-semibold">
        {editor.error ? <span role="alert" className="min-w-0 flex-1 truncate text-[var(--status-danger)]" title={editor.error}>{editor.error}</span> : <span aria-hidden="true" className="min-w-0 flex-1" />}
        <button type="button" onClick={editor.onCancel} disabled={editor.isSaving} className="shape-compact h-7 px-2 text-[var(--control-text)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={!editor.isDirty || editor.isSaving} aria-busy={editor.isSaving || undefined} className="shape-compact inline-flex h-7 items-center gap-1 bg-[var(--accent-primary)] px-2.5 text-[var(--accent-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
          {editor.isSaving ? <Loader2Icon className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckIcon className="h-3 w-3" aria-hidden="true" />}
          {editor.isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>;
}

/**
 * The profile wall stays image-only at rest. Hover and keyboard focus exchange
 * the cover for the project's own summary and canonical engagement totals while
 * preserving the exact frame, click target, and wall geometry.
 */
function ProfileProjectTile({
  project,
  creator,
  isSharedView,
  disabled,
  onOpen,
  onOpenComments,
  showEngagementMetrics,
  descriptionEditor,
  onEditDescription,
  onEditProject,
  onRepositionPreview
}: {
  project: Project;
  creator: Pick<Profile, 'id' | 'name' | 'avatar'>;
  isSharedView: boolean;
  disabled: boolean;
  onOpen: () => void;
  onOpenComments?: () => void;
  showEngagementMetrics: boolean;
  descriptionEditor?: InlineDescriptionEditor;
  onEditDescription?: () => void;
  onEditProject?: () => void;
  onRepositionPreview?: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showCreator = usePresentation() !== 'mobile';
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuFocus = useMenuFocus({ open: isMenuOpen, menuRef, triggerRef: menuTriggerRef, onOpen: () => setIsMenuOpen(true), onClose: () => setIsMenuOpen(false) });
  const hasOwnerActions = Boolean(onEditDescription || onEditProject || onRepositionPreview);



  const runAction = (action: (() => void) | undefined) => {
    setIsMenuOpen(false);
    action?.();
  };

  return <ProjectPreviewCard project={project} creator={creator} onOpen={onOpen} onOpenComments={onOpenComments}
      showCreator={showCreator}
      onCollapse={() => setIsMenuOpen(false)}
      disabled={disabled || Boolean(descriptionEditor)} showEngagementMetrics={showEngagementMetrics}
      creatorHref={isSharedView ? buildPath('sharedProfile', { profileId: creator.id }) : buildPath('profile', { profileId: creator.id })}
      sizes="(min-width: 1100px) 24vw, (min-width: 700px) 33vw, 92vw"
      editor={descriptionEditor ? <ProfileDescriptionEditor projectTitle={project.title} editor={descriptionEditor} /> : undefined}
        footerEnd={hasOwnerActions && !descriptionEditor ? <span className="relative inline-flex items-center">
            <button ref={menuTriggerRef} onKeyDown={menuFocus.onTriggerKeyDown} type="button" data-borderless-control="" aria-label={`Edit ${project.title}`} title="Project options" aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} className="shape-compact inline-flex h-5 w-6 items-center justify-center border-0 bg-transparent p-0 text-[var(--accent-text)] shadow-none focus:outline-none">
              <InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" />
            </button>
            {isMenuOpen ? <span ref={menuRef} tabIndex={-1} role="menu" aria-label={`Edit ${project.title}`} className="shape-compact absolute bottom-[calc(100%+6px)] right-0 z-40 flex w-48 flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-pop)]">
                {onRepositionPreview ? <button type="button" role="menuitem" onClick={() => runAction(onRepositionPreview)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={MoveIcon} size="sm" weight="medium" />
                    Reposition preview…
                  </button> : null}
                {onEditDescription ? <button type="button" role="menuitem" onClick={() => runAction(onEditDescription)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" />
                    Edit description…
                  </button> : null}
                {onEditProject ? <button type="button" role="menuitem" onClick={() => runAction(onEditProject)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" />
                    Edit project…
                  </button> : null}
              </span> : null}
          </span> : undefined}
    />;
}

/** Reads one labelled figure off the record. Absent means absent — never zero-by-invention. */
function readStat(profile: Profile, label: string): string | null {
  return profile.stats.find((stat) => stat.label.toLowerCase() === label.toLowerCase())?.value ?? null;
}

function ProfileIdentityAndLinks({
  profile,
  displayName,
  links,
  showLinks = true,
  onOpenBio,
  summaryCounts
}: {
  profile: Profile;
  displayName: string;
  links: ProfileLink[];
  showLinks?: boolean;
  onOpenBio?: () => void;
  summaryCounts?: { projectCount: number; portalCount: number; activeView: ProfileContentView; onSelect: (view: 'projects' | 'portals') => void; disabled: boolean };
}) {
  return <div className="profile-identity-and-links flex w-full min-w-0 flex-wrap items-start gap-x-6 gap-y-3">
      <div className="profile-identity-main flex min-w-0 max-w-full items-center gap-2.5">
        <ProfileAvatar key={profile.id} name={displayName} avatar={profile.avatar} size="profile" />
        <div className="profile-identity-copy flex min-w-0 flex-col justify-center">
          <h1 className="cdx-panel-title min-w-0 truncate font-semibold text-[var(--text-primary)]" title={displayName}>
            {displayName}
          </h1>
          {profile.location && <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.2] text-[var(--text-secondary)]" title={profile.location}>{profile.location}</p>}
          {summaryCounts && <div className="profile-summary-counts mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] leading-[1.3] text-[var(--text-secondary)]" aria-label="Profile summary">
            <button type="button" aria-pressed={summaryCounts.activeView === 'projects'} aria-controls="profile-content" disabled={summaryCounts.disabled} onClick={() => summaryCounts.onSelect('projects')} className="profile-count-control min-h-11 whitespace-nowrap text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-45"><span className="font-semibold tabular-nums">{summaryCounts.projectCount}</span> {summaryCounts.projectCount === 1 ? 'project' : 'projects'}</button>
            <button type="button" aria-pressed={summaryCounts.activeView === 'portals'} aria-controls="profile-content" disabled={summaryCounts.disabled} onClick={() => summaryCounts.onSelect('portals')} className="profile-count-control min-h-11 whitespace-nowrap text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-45"><span className="font-semibold tabular-nums">{summaryCounts.portalCount}</span> {summaryCounts.portalCount === 1 ? 'portal' : 'portals'}</button>
          </div>}
        </div>
      </div>
      {showLinks && <div className="min-w-0 flex-1 self-center">
        {links.length > 0 || onOpenBio ? <PlatformGrid links={links} profileName={displayName} onOpenBio={onOpenBio} /> : null}
      </div>}
    </div>;
}

type ProfileContentView = 'projects' | 'portals' | 'followers' | 'following';

function ProfileStats({
  projectCount,
  portalCount,
  followers,
  following,
  activeView,
  onSelect,
  disabled
}: {
  projectCount: number;
  portalCount: number;
  followers: string | null;
  following: string | null;
  activeView: ProfileContentView;
  onSelect: (view: ProfileContentView) => void;
  disabled: boolean;
}) {
  const views = [
    { id: 'projects', count: projectCount, label: projectCount === 1 ? 'project' : 'projects' },
    { id: 'portals', count: portalCount, label: portalCount === 1 ? 'portal' : 'portals' },
    { id: 'followers', count: followers ?? '0', label: 'followers' },
    { id: 'following', count: following ?? '0', label: 'following' },
  ] as const;
  return <div role="group" aria-label="Profile content" className="side-panel-control-row min-w-0 flex-wrap text-[12px] leading-none text-[var(--text-secondary)]">
    {views.map((view) => <button key={view.id} type="button" aria-pressed={activeView === view.id} aria-controls="profile-content" disabled={disabled} onClick={() => onSelect(view.id)} className="profile-count-control side-panel-primary-control shape-compact whitespace-nowrap px-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-45">
      <span className="font-semibold tabular-nums">{view.count}</span> {view.label}
    </button>)}
  </div>;
}

export function UserProfilePage({
  profile,
  onBack,
  mobilePortalsView,
  mobileContent,
  mobileContentView,
  mobileProjectSelected = false,
  mobileProjectIndexOpen = false,
  onMobileViewChange,
  mobileWallScrollMemory,
  viewerRole,
  follow,
  onSignInRequest,
  onOpenProject,
  onEditProfile,
  onCollaboration,
  shareUrl,
  onBeforeShare,
  isSharedView = false,
  onAddCategory,
  onOpenActivity
}: UserProfilePageProps) {
  const isMobile = usePresentation() === 'mobile';
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get('view');
  const activeView: ProfileContentView = isMobile && mobileContent && mobileContentView ? mobileContentView : !isSharedView && (requestedView === 'portals' || requestedView === 'followers' || requestedView === 'following') ? requestedView : 'projects';
  const setActiveView = (view: ProfileContentView) => {
    if (isMobile && onMobileViewChange) {
      onMobileViewChange(view);
      return;
    }
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (view === 'projects') next.delete('view');
      else next.set('view', view);
      return next;
    }, { replace: !(isMobile && view === 'portals') });
  };
  // This page renders portfolio media from canonical projects and nothing else.
  // It used to keep its own list of picked image files as object URLs and show
  // them as tiles beside the real work — a second, parallel way for media to
  // reach a profile that bypassed projects, publishing, and the media services
  // entirely, and that vanished on reload. Media now enters only through the
  // publishing flow.
  const showsOwnerTools = canAuthor(viewerRole);
  const density = useProjectGridDensity(profile, showsOwnerTools && !isSharedView);
  const columnsPerRow = density.columns;
  const projectManagement = useProjectManagement(showsOwnerTools ? profile.id : null);
  const [isReorderingProjects, setIsReorderingProjects] = useState(false);
  const profilePageRef = useRef<HTMLDivElement>(null);
  const mobileWallScroll = useRef({ profileId: profile.id, top: 0 });
  if (mobileWallScroll.current.profileId !== profile.id) mobileWallScroll.current = { profileId: profile.id, top: 0 };
  const finishingReorder = useRef(false);
  /*
   * Public or private, written through the profile service. The state shown is
   * always the confirmed one — nothing flips ahead of the service agreeing.
   */
  const visibility = useProfileVisibility(profile);
  /*
   * Requests to follow the SIGNED-IN viewer's own profile. Read here rather than
   * per-visit: it is the viewer's inbox, so it is only ever shown on their own
   * profile — never while looking at someone else's.
   */
  const followRequests = useFollowRequests();
  const connections = useProfileConnections(profile.id, activeView === 'followers' || activeView === 'following' ? activeView : null, followRequests.count);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false);
  const [isBioOpen, setIsBioOpen] = useState(false);
  useEffect(() => { setIsMobileToolsOpen(false); setIsBioOpen(false); }, [profile.id]);
  useEffect(() => { if (!isMobile) setIsBioOpen(false); }, [isMobile]);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement>(null);
  const manageTriggerRef = useRef<HTMLButtonElement>(null);
  useMenuFocus({ open: isManageOpen, menuRef: manageMenuRef, triggerRef: manageTriggerRef, mode: 'dialog', onOpen: () => setIsManageOpen(true), onClose: () => setIsManageOpen(false) });
  // A creator does not follow themselves, and a guest is told an account is
  // needed rather than shown a control that quietly fails.
  const showsFollow = viewerRole === 'visitor';
  const showsSignInToFollow = needsAccount(viewerRole);
  const displayName = profile.name;
  const profileLinks = useMemo(() => mergeProfileLinks(profile.links, profile.socialLinks), [profile.links, profile.socialLinks]);

  // Read straight off the record, so the figure states how much work exists
  // rather than how many tiles happen to be rendered below it.
  const projectCount = profile.projects.length;
  const headerRef = useRef<HTMLElement>(null);
  // The title is collected before any record exists, so this is transient form
  // state and nothing more.
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  /* Only canonical, published projects contribute media to this profile. A new
   * profile therefore starts empty, and no seeded photograph can appear under
   * somebody's identity. */
  const cardProjects = useMemo(() => profile.projects.filter((project) => Boolean(project.cover)), [profile.projects]);
  const projectOrder = useProfileProjectOrder(
    showsOwnerTools && !isSharedView ? profile.id : null,
    cardProjects,
    showsOwnerTools && !isSharedView
  );
  const orderedCardProjects = useMemo(() => {
    const projectsById = new Map(cardProjects.map((project) => [project.id, project]));
    return projectOrder.order
      .map((projectId) => projectsById.get(projectId))
      .filter((project): project is Project => Boolean(project));
  }, [cardProjects, projectOrder.order]);
  const showsMobileReorder = isMobile && showsOwnerTools && !isSharedView && activeView === 'projects' && !mobileContent;
  const canReorderProjects = orderedCardProjects.length > 1 && !projectOrder.isSaving && projectManagement.editor.projectId === null;
  const startReordering = () => {
    if (!showsMobileReorder || !canReorderProjects) return;
    projectOrder.reset();
    setIsReorderingProjects(true);
    setIsMobileToolsOpen(false);
    setIsManageOpen(false);
  };
  const finishReordering = async () => {
    if (finishingReorder.current || projectOrder.isSaving) return;
    finishingReorder.current = true;
    try {
      const saved = await (projectOrder.saveError ? projectOrder.retry() : projectOrder.commit());
      if (saved) setIsReorderingProjects(false);
    } finally {
      finishingReorder.current = false;
    }
  };
  const cancelReordering = () => {
    projectOrder.reset();
    projectOrder.dismissError();
    setIsReorderingProjects(false);
  };
  useReorderOutsideTap(isMobile && showsOwnerTools && !isSharedView && isReorderingProjects, profilePageRef, () => { void finishReordering(); });
  const imageryCells: WallItem[] = useMemo(() => orderedCardProjects.map((project) => ({
    key: project.id,
    ratio: getProjectAspectRatio(project),
    content: <div className="relative w-full">
          <ProfileProjectTile
            project={project}
            creator={profile}
            isSharedView={isSharedView}
            disabled={isReorderingProjects}
            onOpen={() => onOpenProject(project.id, project.categoryId)}
            onOpenComments={!isSharedView ? () => onOpenProject(project.id, project.categoryId, { openComments: true }) : undefined}
            showEngagementMetrics={!isSharedView}
            descriptionEditor={projectManagement.editor.projectId === project.id && projectManagement.editor.mode === 'description' ? {
              phase: projectManagement.editor.phase,
              value: projectManagement.editor.metadata.summary,
              error: projectManagement.editor.fieldErrors.summary ?? projectManagement.editor.failure?.message ?? projectManagement.editor.loadError,
              isDirty: projectManagement.editor.isDirty,
              isSaving: projectManagement.editor.isSaving,
              onChange: (value) => projectManagement.editor.setField('summary', value),
              onRetry: projectManagement.editor.retryLoad,
              onSave: async () => {
                const outcome = await projectManagement.editor.save();
                if (outcome === null) await projectManagement.editor.close();
              },
              onCancel: () => { void projectManagement.editor.close(); }
            } : undefined}
            onEditDescription={showsOwnerTools && !isSharedView && !isReorderingProjects && projectManagement.editor.projectId === null ? () => projectManagement.editor.open(project.id, 'description') : undefined}
            onEditProject={showsOwnerTools && !isSharedView && !isReorderingProjects && projectManagement.editor.projectId === null ? () => projectManagement.editor.open(project.id) : undefined}
            onRepositionPreview={project.cover && showsOwnerTools && !isSharedView && !isReorderingProjects && projectManagement.editor.projectId === null ? () => projectManagement.editor.open(project.id, 'cover') : undefined}
          />
        </div>
  })), [orderedCardProjects, profile, onOpenProject, isSharedView, showsOwnerTools, isReorderingProjects, projectManagement.editor]);
  const followers = connections.counts.followers?.toLocaleString() ?? readStat(profile, 'Followers');
  const following = connections.counts.following?.toLocaleString() ?? readStat(profile, 'Following');
  // Every region of the page — toolbar, identity, and wall — now sits on the
  // same 8px edge, so their left and right boundaries agree and the page uses
  // the whole area rather than holding a margin the wall no longer keeps.
  // A genuinely sparse row keeps its card cap so one item doesn't balloon to
  // fill the page. A full row of the chosen column count expands evenly into
  // whatever width the shell currently has.
  const fitsInOneRow = imageryCells.length < columnsPerRow;
  const gridWidth = fitsInOneRow ? columnsPerRow * MAX_CARD_WIDTH + (columnsPerRow - 1) * GRID_GAP : undefined;
  const nestedMobileContent = mobileContent ?? (isMobile && !isSharedView && activeView === 'portals' ? mobilePortalsView : undefined);
  const mobilePortalOverlay = isMobile && activeView === 'portals' ? nestedMobileContent : undefined;
  const portalOverlayRef = useRef<HTMLDivElement>(null);
  const closePortalsRef = useRef(() => setActiveView('projects'));
  closePortalsRef.current = () => setActiveView('projects');
  const hasMobilePortalOverlay = Boolean(mobilePortalOverlay);
  useMobilePortalPopupSize(profilePageRef, portalOverlayRef, hasMobilePortalOverlay);
  useEffect(() => {
    if (!hasMobilePortalOverlay) return;
    let press: { x: number; y: number; outside: boolean } | null = null;
    const inside = (target: EventTarget | null) => !(target instanceof Element)
      || Boolean(portalOverlayRef.current?.querySelector('.mobile-portals-page')?.contains(target))
      || Boolean(target.closest('[data-mobile-portal-menu], .modal-scrim'));
    const down = (event: PointerEvent) => {
      press = { x: event.clientX, y: event.clientY, outside: event.isPrimary && event.button === 0 && !inside(event.target) };
    };
    const move = (event: PointerEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.outside = false;
    };
    const cancel = () => { press = null; };
    const click = (event: MouseEvent) => {
      const isOutsideTap = event.detail === 0 || press?.outside;
      press = null;
      if (inside(event.target) || !portalOverlayRef.current || portalOverlayRef.current.closest('[inert], [aria-hidden="true"]')) return;
      // The whole screen dismisses, including the profile header and dock.
      // Consume the tap so it cannot also open content or reopen the chooser.
      event.preventDefault();
      event.stopPropagation();
      if (isOutsideTap) closePortalsRef.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointercancel', cancel, true);
      document.removeEventListener('click', click, true);
    };
  }, [hasMobilePortalOverlay]);
  const isMobileWall = isMobile && (activeView === 'projects' || activeView === 'portals') && (!nestedMobileContent || Boolean(mobilePortalOverlay));
  const isWebWorkspace = !isMobile && Boolean(mobileContent);
  const isMobileProject = isMobile && Boolean(mobileContent) && mobileProjectSelected;
  const projectWall = imageryCells.length === 0 ? <EmptyState title="No work published yet" description={showsOwnerTools ? 'Open a category, then choose Add project to publish the first one.' : `${displayName} has not published any work yet.`} /> : <div className="w-full" style={{ maxWidth: gridWidth ? `${gridWidth}px` : undefined }}>
    <JustifiedImageWall key={profile.id} label={`${displayName} — profile imagery`} columns={columnsPerRow} onColumnsChange={density.setColumns} items={imageryCells} reorderMode={isReorderingProjects ? {
      enabled: isReorderingProjects,
      disabled: projectOrder.isSaving,
      onMove: projectOrder.move,
      onMoveByOffset: projectOrder.moveByOffset
    } : undefined} />
  </div>;
  // Mobile keeps one body scroller when the profile identity is hidden;
  // the display-contents wrapper preserves the desktop document flow.
  return <div ref={profilePageRef} data-saved-change-scope="" data-profile-page={isWebWorkspace ? undefined : ''} data-profile-nested={isMobile && (nestedMobileContent || isMobileWall) ? '' : undefined} className={isWebWorkspace ? 'contents' : 'user-profile-canvas flex min-h-full w-full flex-col text-[var(--text-primary)]'}>
      <div data-profile-header="" data-mobile-project-header-preview={isMobileProject && mobileProjectIndexOpen ? '' : undefined} className={isWebWorkspace || (isMobileProject && !mobileProjectIndexOpen) ? 'hidden' : 'profile-header-region contents'}>
      {isSharedView && <header className="user-profile-canvas ps-panel-toolbar w-full">
          <section aria-label={`${displayName} information`} className="flex min-h-16 w-full items-center px-3 py-2 text-left">
            <ProfileIdentityAndLinks profile={profile} displayName={displayName} links={profileLinks} onOpenBio={isMobile ? () => setIsBioOpen(true) : undefined} />
          </section>
        </header>}
      {/* One 8px rhythm through the strip, and it shares the content column's
         width so its rule lines up with every rule and card edge below it. */}
      {/* The toolbar material creates its own stacking context. Keep that local
          context above the identity/link row so menus opened from the toolbar
          cover later content instead of letting its icon buttons paint through. */}
      {!isSharedView && isMobile && <header className="mobile-profile-header">
        <ProfileIdentityAndLinks profile={profile} displayName={displayName} links={profileLinks} showLinks={false} summaryCounts={!isMobileToolsOpen ? { projectCount, portalCount: profile.categories.length, activeView: mobileProjectIndexOpen ? 'portals' : activeView, onSelect: setActiveView, disabled: isReorderingProjects || projectManagement.editor.projectId !== null } : undefined} />
        {isReorderingProjects ? <div data-profile-reorder-controls="" className="mobile-profile-reorder-actions" aria-label="Project order">
          <button type="button" disabled={projectOrder.isSaving} aria-busy={projectOrder.isSaving || undefined} onClick={() => { void finishReordering(); }} className="text-[var(--accent-text)]">{projectOrder.isSaving ? 'Saving…' : 'Done'}</button>
          <button type="button" disabled={projectOrder.isSaving} onClick={cancelReordering}>Cancel</button>
        </div> : <button type="button" className="mobile-profile-options" aria-label="Profile options" aria-expanded={isMobileToolsOpen} aria-controls="profile-navigation-tools" onClick={() => setIsMobileToolsOpen(open => !open)}><InterfaceIcon icon={MoreHorizontalIcon} /></button>}
      </header>}
      {showsOwnerTools && !isReorderingProjects && <SavedChangeNotice history={projectOrder.history} />}
      {density.saveError && <p role="status" className="px-2 py-2 text-[13px] text-[var(--text-secondary)]">{density.saveError} <button type="button" onClick={() => { void density.retry(); }} className="text-[var(--accent-text)] underline">Retry layout save</button></p>}
      {isMobile && isReorderingProjects && <div data-profile-reorder-controls="" className="px-2 pb-2 text-[12px] text-[var(--text-secondary)]">
        <p role="status">{projectOrder.saveError ? 'The order wasn’t saved. Tap Done to try again.' : 'Swipe to scroll. Hold a project to move it. Tap outside the cards to save.'}</p>
      </div>}
      {!isSharedView && (!isMobile || isMobileToolsOpen) && <header id="profile-navigation-tools" className="user-profile-canvas ps-panel-toolbar global-control-header profile-navigation-header side-panel-content-inset relative z-20 w-full">
        <div className="side-panel-control-row w-full min-w-0 flex-wrap">
          {!isMobile && <ScreenBack><button type="button" onClick={onBack} aria-label="Go back" className="side-panel-compact-control shape-compact inline-flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
            </button></ScreenBack>}
          {/* Audience figures sit in the toolbar rather than the header below, so
             the header's fact area stays about the work itself. They read from
             the record — a profile carrying no figure shows none rather than a
             fabricated zero — and they are shown to every viewer, because an
             audience count is part of how a creator presents themselves. */}
          <ProfileStats projectCount={projectCount} portalCount={profile.categories.length} followers={followers} following={following} activeView={activeView} onSelect={setActiveView} disabled={isReorderingProjects || projectManagement.editor.projectId !== null} />
          {/* Pending requests sit with the audience figures, because that is what
             they are about to change — and only the creator being asked ever
             sees them. The count is the service's own answer: nothing is shown
             while the read is in flight or if it failed, because a number the
             list behind it cannot substantiate is worse than none. Zero is a
             real answer, so the control simply is not offered. */}
          {showsOwnerTools && visibility.isPrivate && followRequests.count > 0 && <div className="relative">
              <button type="button" data-follow-requests-control="" data-system-color="" onClick={() => setIsRequestsOpen((open) => !open)} aria-expanded={isRequestsOpen} aria-haspopup="dialog" aria-label={`${followRequests.count} pending follow ${followRequests.count === 1 ? 'request' : 'requests'}`} className="side-panel-primary-control side-panel-control-row border border-[var(--social-unread)] px-3 text-[11px] font-semibold text-[var(--social-unread)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <UserPlusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">{followRequests.count}</span>
                <span>{followRequests.count === 1 ? 'request' : 'requests'}</span>
              </button>
              {isRequestsOpen && <div role="dialog" aria-label="Follow requests" onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsRequestsOpen(false);
            }
          }} className="absolute left-0 top-[calc(100%+8px)] z-40 w-[300px] rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-2 shadow-[0_16px_36px_rgba(0,0,0,0.22)]">
                  {followRequests.actionError && <p role="alert" className="px-2 pb-2 pt-1 text-[11px] leading-snug text-[var(--text-secondary)]">{followRequests.actionError}</p>}
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {followRequests.requests.map((request) => <li key={request.profileId} className="flex list-none items-center gap-2.5 rounded-[9px] px-2 py-1.5">
                        <span aria-hidden="true" className="squircle flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--surface-placeholder)] text-[11px] font-semibold text-[var(--text-secondary)]">
                          {request.avatar ? <ResponsiveImage src={request.avatar} decorative width={32} height={32} sizes="32px" className="squircle h-full w-full object-cover" /> : request.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{request.name}</span>
                          <span className="block truncate text-[11px] text-[var(--text-secondary)]">{request.handle}</span>
                        </span>
                        {/* Approving grants the follow, so it is the affirmative
                     action and carries the accent; declining is plain. */}
                        <button type="button" onClick={() => followRequests.approve(request.profileId)} disabled={followRequests.pendingProfileId !== null} aria-label={`Approve ${request.name}'s follow request`} className="h-7 shrink-0 rounded-full bg-[var(--accent-primary)] px-2.5 text-[11px] font-semibold text-[var(--accent-foreground)] transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
                          {followRequests.pendingProfileId === request.profileId ? '…' : 'Approve'}
                        </button>
                        <button type="button" onClick={() => followRequests.decline(request.profileId)} disabled={followRequests.pendingProfileId !== null} aria-label={`Decline ${request.name}'s follow request`} className="h-7 shrink-0 rounded-full px-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
                          Decline
                        </button>
                      </li>)}
                  </ul>
                </div>}
            </div>}
          {isMobile && <div data-mobile-profile-links="" className="w-full min-w-0 basis-full">
            <PlatformGrid links={profileLinks} profileName={displayName} onOpenBio={() => setIsBioOpen(true)} />
          </div>}
          {/* Mobile owner actions follow the profile links in one icon row. */}
          <div data-profile-owner-actions={showsOwnerTools ? '' : undefined} className="side-panel-control-row ml-auto min-w-0 max-w-full flex-wrap justify-end">
            {isMobile && showsOwnerTools && <button type="button" onClick={onCollaboration} disabled={!onCollaboration} aria-label="Collaboration" title="Collaboration" className="profile-action-button side-panel-compact-control shape-compact inline-flex items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] disabled:opacity-45">
              <InterfaceIcon icon={HandshakeIcon} size="sm" weight="medium" />
            </button>}
            {/* A signed-in visitor can follow. A guest is told plainly that this
               needs an account rather than being shown a control that silently
               fails, and reading the work stays open either way. */}
            {/* The control appears once the service has answered, and is withheld
               if that read failed — a button that cannot state the truth about
               whether the viewer follows this creator is worse than none. While a
               change is in flight it is disabled, so one press cannot become two
               requests, and the label keeps showing the last confirmed state
               rather than a state the service has not agreed to. */}
            {showsFollow && follow && !follow.resolveError && <span className="side-panel-control-row">
                {/* Following is the SELECTED state, so it is the one that carries
                 the accent — the accent belongs to selected controls. It read
                 the other way round before, which meant the button was loudest
                 when nothing had been chosen. The label and `aria-pressed`
                 change with it, so the state never rests on colour alone. */}
                {/* A private profile is followed by REQUEST, so the control has
                 three confirmed states, not two. Requested is a waiting state
                 rather than a granted one, so it stays neutral with a clock —
                 only a confirmed follow earns the accent — and pressing it
                 withdraws the request instead of asking a second time. */}
                <button type="button" onClick={follow.onToggle} disabled={follow.isResolving || follow.isPending} aria-pressed={follow.isFollowing || follow.isRequested} aria-busy={follow.isPending || undefined} aria-label={follow.isFollowing ? `Unfollow ${displayName}` : follow.isRequested ? `Withdraw your follow request to ${displayName}` : visibility.isPrivate ? `Request to follow ${displayName}` : `Follow ${displayName}`} className={`side-panel-primary-control side-panel-control-row px-3.5 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60 ${follow.isFollowing ? 'border border-transparent bg-[var(--accent-primary)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]' : 'border border-[var(--hairline-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}>
                  {follow.isRequested && !follow.isPending && <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {follow.isPending ? 'Working…' : follow.isFollowing ? 'Following' : follow.isRequested ? 'Requested' : visibility.isPrivate ? 'Request' : 'Follow'}
                </button>
                {follow.mutationError && <span role="alert" className="flex items-center gap-1.5 text-[11px] leading-none text-[var(--text-secondary)]">
                    {follow.mutationError}
                    {follow.onRetry && <button type="button" onClick={follow.onRetry} className="font-semibold text-[var(--text-primary)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>}
                  </span>}
              </span>}
            {showsSignInToFollow && onSignInRequest && <button type="button" onClick={onSignInRequest} className="side-panel-primary-control flex items-center border border-[var(--hairline-strong)] px-3.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Sign in to follow
              </button>}
            {!showsOwnerTools && !isSharedView && <CreatorSaveButton profileId={profile.id} name={profile.name} />}
            {!isMobile && showsOwnerTools && onOpenActivity ? <div role="group" aria-label="Profile engagement collections" className="profile-action-engagement side-panel-control-row">
                {ENGAGEMENT_KINDS.filter((kind) => kind !== 'save').map((kind) => {
              const Icon = ACTIVITY_ICONS[kind];
              const labels = describeActivityCollection(kind);
              const color = ACTIVITY_COLORS[kind];
              return <button key={kind} type="button" data-semantic-action="engagement-collection" onClick={() => onOpenActivity(kind)} aria-label={`Open ${labels.title}`} title={labels.title} className="profile-action-button side-panel-compact-control shape-compact inline-flex shrink-0 items-center justify-center border border-[var(--hairline-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={Icon} size="sm" weight="medium" keepColor stroke={color} style={{ color }} />
                  </button>;
            })}
              </div> : null}
            {!isMobile && showsOwnerTools && shareUrl ? <ProfileShareMenu shareUrl={shareUrl} onBeforeCopy={onBeforeShare} /> : null}
            {showsOwnerTools && onEditProfile ? <button type="button" onClick={onEditProfile} aria-label="Edit profile" title={isMobile ? 'Edit profile' : undefined} className="profile-action-button side-panel-primary-control side-panel-control-row border border-[var(--hairline-strong)] px-3 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" opticalOffset={{ y: -0.25 }} />
                <span className={isMobile ? 'sr-only' : undefined}>Edit profile</span>
              </button> : null}
            {isMobile && showsOwnerTools && shareUrl ? <ProfileShareMenu shareUrl={shareUrl} onBeforeCopy={onBeforeShare} compact /> : null}
            {isMobile && showsOwnerTools && <button type="button" data-profile-reorder-start="" aria-label="Reorder projects" title="Reorder projects" disabled={!showsMobileReorder || !canReorderProjects} onClick={startReordering}
              className="profile-action-button side-panel-compact-control shape-compact inline-flex items-center justify-center border border-[var(--hairline-strong)] text-[var(--text-primary)] disabled:opacity-45">
              <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
            </button>}
            {!isMobile && showsOwnerTools ? <div className="relative">
                <button ref={manageTriggerRef} type="button" onClick={() => setIsManageOpen((open) => !open)} aria-label="Manage profile" title={isMobile ? 'Manage profile' : undefined} aria-expanded={isManageOpen} aria-haspopup="dialog" className="profile-action-button side-panel-primary-control side-panel-control-row border border-[var(--hairline-strong)] px-3 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <InterfaceIcon icon={Settings2Icon} size="sm" weight="medium" />
                  <span className={isMobile ? 'sr-only' : undefined}>Manage</span>
                  {!isMobile && <InterfaceIcon icon={ChevronDownIcon} size="xs" weight="medium" className={`transition-transform duration-150 ${isManageOpen ? 'rotate-180' : ''}`} />}
                </button>
                {isManageOpen ? <div ref={manageMenuRef} tabIndex={-1} role="dialog" aria-label="Profile management" className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-pop)]">
                    {!(isMobile && mobileContent) && <><div className="flex min-h-10 items-center gap-3 rounded-[8px] px-2.5">
                      <label htmlFor="profile-view-density" className="min-w-0 flex-1 text-[12px] font-medium text-[var(--text-primary)]">View density</label>
                      <input id="profile-view-density" type="range" min={MIN_PROJECT_GRID_COLUMNS} max={MAX_PROJECT_GRID_COLUMNS} step={1} value={columnsPerRow} onChange={(event) => density.setColumns(Number(event.target.value))} aria-label="Cards per row" aria-valuetext={`${columnsPerRow} cards per row`} className="h-1 w-16 cursor-pointer accent-[var(--accent-primary)]" />
                    </div>
                    {!isMobile && <button type="button" disabled={orderedCardProjects.length < 2 || projectOrder.isSaving || projectManagement.editor.projectId !== null} onClick={() => {
                  projectOrder.reset();
                  setActiveView('projects');
                  setIsReorderingProjects(true);
                  setIsManageOpen(false);
                }} className="flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45">
                      <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
                      Reorder projects
                    </button>}</>}
                    <button type="button" onClick={visibility.onToggle} disabled={visibility.isPending} aria-pressed={visibility.isPrivate} aria-busy={visibility.isPending || undefined} className="flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
                      <InterfaceIcon icon={LockIcon} size="sm" weight="medium" />
                      <span className="min-w-0 flex-1">Account visibility</span>
                      <span className="text-[11px] text-[var(--text-secondary)]">{visibility.isPending ? 'Working…' : visibility.isPrivate ? 'Private' : 'Public'}</span>
                    </button>
                    {visibility.error ? <p role="alert" className="px-2.5 py-1.5 text-[11px] leading-snug text-[var(--status-danger)]">
                        {visibility.error} {visibility.onRetry ? <button type="button" onClick={visibility.onRetry} className="font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button> : null}
                      </p> : null}
                    {onAddCategory ? <button type="button" onClick={() => {
                  setIsAddingCategory(true);
                  setIsManageOpen(false);
                }} aria-haspopup="dialog" className="flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                        <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
                        Add Portal
                      </button> : null}
                  </div> : null}
              </div> : null}
          </div>
        </div>
      </header>}

      </div>
      {isMobile && isBioOpen && <ProfileBioSheet key={profile.id} profileId={profile.id} bio={profile.headline}
        canEdit={showsOwnerTools && !isSharedView} onClose={() => setIsBioOpen(false)} />}
      {/* Naming the category and choosing its mark happens before the record is
         created, so an abandoned attempt leaves nothing behind. */}
      {isAddingCategory && onAddCategory && <NewCategoryDialog onCancel={() => setIsAddingCategory(false)} onCreate={(label, iconName) => {
      onAddCategory(label, iconName);
      setIsAddingCategory(false);
    }} />}

      {!isMobile && isReorderingProjects && showsOwnerTools && !isSharedView ? <section aria-label="Reorder projects" className="mx-2 mt-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-[var(--surface-raised)] px-3 py-2.5 shadow-[var(--shadow-pop)] ring-1 ring-inset ring-[var(--hairline)]">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
          </span>
          <div className="min-w-[190px] flex-1">
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">Arrange your projects</p>
            <p className="text-[11px] leading-snug text-[var(--text-secondary)]">Drag the wiggling cards into place, then choose Done.</p>
            {projectOrder.saveError ? <p role="alert" className="mt-1 text-[11px] text-[var(--status-danger)]">
                {projectOrder.saveError}{' '}
                <button type="button" onClick={async () => {
              if (await projectOrder.retry()) setIsReorderingProjects(false);
            }} className="font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
              </p> : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" disabled={projectOrder.isSaving} onClick={() => {
          projectOrder.reset();
          projectOrder.dismissError();
          setIsReorderingProjects(false);
        }} className="inline-flex h-8 items-center rounded-[8px] px-3 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">Cancel</button>
            <button type="button" disabled={projectOrder.isSaving} aria-busy={projectOrder.isSaving || undefined} onClick={async () => {
          if (await projectOrder.commit()) setIsReorderingProjects(false);
        }} className="inline-flex h-8 min-w-[68px] items-center justify-center gap-1.5 rounded-[8px] bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-white transition-[filter] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
              {projectOrder.isSaving ? <InterfaceIcon icon={Loader2Icon} size="xs" weight="medium" className="animate-spin" /> : <InterfaceIcon icon={CheckIcon} size="xs" weight="medium" />}
              {projectOrder.isSaving ? 'Saving…' : 'Done'}
            </button>
          </div>
        </section> : null}

      {!isSharedView && !isMobile && !isWebWorkspace && <div className="w-full px-2 pt-[var(--side-panel-content-inset)]">
        {/* Three regions, read left to right: who → where else they are → what the
           work amounts to. They only sit side by side once there is room; below
           that the same order stacks. */}
        {/* Four equal areas across the header: who they are, then the presence
           marks spanning the two middle areas, then what the work amounts to at
           the far end. Equal shares mean the marks sit in the centre half of the
           row by construction rather than by a hand-tuned width. */}
        {/* Identity keeps only the width it needs; the marks take the whole
           remainder and spread across it. A fixed column split could not do
           both, because the name's width is set by the name. */}
        <section ref={headerRef} aria-label={`${displayName} information`} className="relative pb-3 text-left">
          <ProfileIdentityAndLinks profile={profile} displayName={displayName} links={profileLinks} />
        </section>

        
      </div>}

      {/* WEB keeps page scrolling; MOBILE contains the wall beneath its header
          so opening the portal chooser never changes the canvas geometry. */}
      {/* The wall runs edge to edge with only its own gutter: the page margin
         belongs to the identity and toolbar above, where the type sits on it.
         Holding the photographs off the same margin only narrowed the rows and
         left the sides of the page bare. */}
      <main id="profile-content" data-mobile-project-selected={isMobileProject ? '' : undefined} className={isWebWorkspace ? 'contents' : nestedMobileContent || isMobileWall ? "mobile-profile-workspace-content" : "w-full flex-1 px-2 pb-8 pt-1"} aria-label={`${displayName} ${activeView}`}>
        {isMobileWall ? <>
          <div className="mobile-profile-wall scrollbar-overlay" aria-hidden={mobilePortalOverlay ? true : undefined} onScroll={event => {
            mobileWallScroll.current.top = event.currentTarget.scrollTop;
            mobileWallScrollMemory?.save(event.currentTarget.scrollTop);
          }} ref={element => {
            if (element) {
              element.inert = Boolean(mobilePortalOverlay);
              element.scrollTop = mobileWallScrollMemory?.read() ?? mobileWallScroll.current.top;
            }
          }}>
            {projectWall}
          </div>
          {mobilePortalOverlay && <div ref={portalOverlayRef} className="mobile-profile-portal-overlay">
            <button type="button" className="mobile-profile-portal-dismiss" aria-label="Close portals" onClick={() => setActiveView('projects')} />
            {mobilePortalOverlay}
          </div>}
        </> : nestedMobileContent ?? (activeView !== 'projects' ? <ProfileCollectionGrid profileId={profile.id} kind={activeView} portals={profile.categories} people={connections.items} loading={activeView !== 'portals' && connections.loading} error={activeView === 'portals' ? null : connections.error} hasMore={activeView !== 'portals' && connections.nextOffset !== null} onRetry={connections.canRetry ? connections.retry : undefined} onLoadMore={connections.loadMore} /> : projectWall)}
      </main>
      {showsOwnerTools && !isSharedView && projectManagement.editor.mode !== 'description' ? <ProjectEditorDialog management={projectManagement} /> : null}
    </div>;
}
function Fact({
  label,
  value



}: {label: string;value: string;}) {
  // The count is stacked under its own name, letterspaced, so the pairing reads
  // as a single figure closing the header rather than two loose lines.
  return <div className="min-w-0 text-center">
      <p className="text-[15px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">{label}</p>
      <p className={`font-bold leading-tight text-[var(--text-primary)] ${value.length > 16 ? 'mt-1 text-[15px]' : 'mt-2 text-[30px]'}`}>{value}</p>
    </div>;
}
