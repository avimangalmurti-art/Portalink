import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, ClockIcon, GripVerticalIcon, HeartIcon, ImageIcon, Loader2Icon, LockIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Repeat2Icon, ReplaceIcon, Settings2Icon, UserPlusIcon, XIcon } from 'lucide-react';
import { useFollowRequests } from '../features/follows/useFollowRequests';
import { useProfileVisibility } from '../features/profile/useProfileVisibility';
import { SectionHeader } from './SectionHeader';
import { EmptyState } from './ui/StateViews';
import { describeActivityCollection, ENGAGEMENT_KINDS, type EngagementKind } from '../types/engagement';
import { PlatformGrid } from './profile/PlatformGrid';
import { JustifiedImageWall, type WallItem } from './profile/JustifiedImageWall';
import { NewCategoryDialog } from './profile/NewCategoryDialog';
import type { Profile, ProfileLink, Project } from '../types/domain';
import { canAuthor, needsAccount, type ViewerRole } from '../types/viewer';
import { getProjectAspectRatio } from '../utils/projectPresentation';
import { projectContinuityStyle } from '../utils/projectContinuity';
import { ProjectCover } from './media/ProjectCover';
import { InterfaceIcon } from './ui/InterfaceIcon';
import { ResponsiveImage } from './ui/ResponsiveImage';
import { CreatorAvatar } from './profile/CreatorAvatar';
import { mergeProfileLinks } from '../features/profile/profileLinks';
import { ProfileShareMenu } from './profile/ProfileShareMenu';
import { ProjectHoverDetails } from './profile/ProjectHoverDetails';
import { ProjectEditorDialog } from '../features/projects/ProjectEditorDialog';
import { ModalPortal } from './ui/ModalPortal';
import { useProjectManagement, type ProjectManagement } from '../features/projects/useProjectManagement';
import { useProfileProjectOrder } from '../features/profile/useProfileProjectOrder';

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
  /** Stable read-only URL intended for people who do not have an account. */
  shareUrl?: string;
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
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 9;
const DEFAULT_COLUMNS = 4;
const PROFILE_DENSITY_STORAGE_KEY = 'portalink.profile-view-density';
// Cards never grow past this, so fewer columns leaves open canvas rather than
// blowing a single card up to fill the screen.
const MAX_CARD_WIDTH = 300;
const GRID_GAP = 16;

function normalizeProfileDensity(value: unknown): number {
  const candidate = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(candidate)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(candidate)));
}

function readProfileDensity(): number {
  try {
    const stored = window.localStorage.getItem(PROFILE_DENSITY_STORAGE_KEY);
    const normalized = stored === null ? DEFAULT_COLUMNS : normalizeProfileDensity(stored);
    // Migrate an older 1–2 column preference into the supported range instead
    // of letting the control and the rendered wall disagree after this change.
    if (stored !== null && stored !== String(normalized)) {
      window.localStorage.setItem(PROFILE_DENSITY_STORAGE_KEY, String(normalized));
    }
    return normalized;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function writeProfileDensity(value: number): number {
  const normalized = normalizeProfileDensity(value);
  try {
    window.localStorage.setItem(PROFILE_DENSITY_STORAGE_KEY, String(normalized));
  } catch {
    // The preference still applies to this session when storage is unavailable.
  }
  return normalized;
}

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
  onOpen,
  onOpenComments,
  showEngagementMetrics,
  descriptionEditor,
  onEditDescription,
  onEditCover,
  onReplaceFiles
}: {
  project: Project;
  onOpen: () => void;
  onOpenComments?: () => void;
  showEngagementMetrics: boolean;
  descriptionEditor?: InlineDescriptionEditor;
  onEditDescription?: () => void;
  onEditCover?: () => void;
  onReplaceFiles?: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const hasOwnerActions = Boolean(onEditDescription || onEditCover || onReplaceFiles);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const runAction = (action: (() => void) | undefined) => {
    setIsMenuOpen(false);
    action?.();
  };

  return (
    <div className="group relative h-full w-full">
      <button
        type="button"
        data-project-continuity-surface=""
        data-project-continuity-id={project.id}
        style={projectContinuityStyle(project.id)}
        onClick={onOpen}
        aria-label={`Open ${project.title}`}
        title={project.title}
        className="relative block h-full w-full cursor-pointer overflow-hidden rounded-none bg-[var(--surface-sunken)] text-left ring-1 ring-inset ring-[var(--hairline)] transition-[border-radius] duration-150 group-hover:rounded-[8px] focus:outline-none focus-visible:rounded-[8px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] motion-reduce:transition-none"
      >
        <span className="absolute inset-0 block transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0 motion-reduce:transition-none">
          <ProjectCover source={project.cover} alt={project.coverAlt} kind={project.coverKind} frame={project.coverFrame} aspectRatio={getProjectAspectRatio(project)} sizes="(min-width: 1100px) 24vw, (min-width: 700px) 33vw, 92vw" />
        </span>

      </button>

      <ProjectHoverDetails
        projectId={project.id}
        summary={project.summary}
        showEngagementMetrics={showEngagementMetrics}
        onOpen={onOpen}
        onOpenComments={onOpenComments}
        className="pointer-events-none rounded-[8px] opacity-0 ring-1 ring-inset ring-transparent transition-[opacity,box-shadow] duration-150 group-hover:opacity-100 group-hover:ring-[var(--hairline-strong)] group-focus-within:opacity-100 group-focus-within:ring-[var(--focus-ring)] motion-reduce:transition-none"
        footerEnd={hasOwnerActions && !descriptionEditor ? <span ref={menuRef} className={`relative inline-flex items-center transition-opacity duration-150 motion-reduce:transition-none ${isMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'}`}>
            <button type="button" data-borderless-control="" aria-label={`Edit ${project.title}`} title="Project options" aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((open) => !open)} className="shape-compact inline-flex h-5 w-6 items-center justify-center border-0 bg-transparent p-0 text-[var(--accent-text)] shadow-none focus:outline-none">
              <InterfaceIcon icon={MoreHorizontalIcon} size="sm" weight="medium" />
            </button>
            {isMenuOpen ? <span role="menu" aria-label={`Edit ${project.title}`} className="shape-compact absolute bottom-[calc(100%+6px)] right-0 z-40 flex w-48 flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-pop)]">
                {onEditDescription ? <button type="button" role="menuitem" onClick={() => runAction(onEditDescription)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" />
                    Edit description…
                  </button> : null}
                {onEditCover ? <button type="button" role="menuitem" onClick={() => runAction(onEditCover)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={ImageIcon} size="sm" weight="medium" />
                    Edit cover…
                  </button> : null}
                {onReplaceFiles ? <button type="button" role="menuitem" onClick={() => runAction(onReplaceFiles)} className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={ReplaceIcon} size="sm" weight="medium" />
                    Replace files…
                  </button> : null}
              </span> : null}
          </span> : undefined}
      />

      {descriptionEditor ? <ProfileDescriptionEditor projectTitle={project.title} editor={descriptionEditor} /> : null}
    </div>
  );
}

/** Reads one labelled figure off the record. Absent means absent — never zero-by-invention. */
function readStat(profile: Profile, label: string): string | null {
  return profile.stats.find((stat) => stat.label.toLowerCase() === label.toLowerCase())?.value ?? null;
}

function ProfileIdentityAndLinks({
  profile,
  displayName,
  links,
  onAvatarOpen
}: {
  profile: Profile;
  displayName: string;
  links: ProfileLink[];
  onAvatarOpen?: () => void;
}) {
  return <div className="flex w-full min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex min-w-0 shrink-0 items-center gap-2.5">
        {onAvatarOpen ? <button type="button" onClick={onAvatarOpen} aria-haspopup="dialog" aria-label={`View ${displayName}'s profile image`} className="shape-compact flex h-10 w-10 shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <CreatorAvatar name={displayName} avatar={profile.avatar} shape="compact" className="h-10 w-10 text-[12px]" />
          </button> : <CreatorAvatar name={displayName} avatar={profile.avatar} shape="compact" className="h-10 w-10 text-[12px]" />}
        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="cdx-panel-title min-w-0 truncate font-semibold text-[var(--text-primary)]" title={displayName}>
            {displayName}
          </h1>
          {profile.location && <p className="mt-0.5 truncate text-[12px] font-medium leading-[1.2] text-[var(--text-secondary)]" title={profile.location}>{profile.location}</p>}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {links.length > 0 ? <PlatformGrid links={links} profileName={displayName} /> : null}
      </div>
    </div>;
}

function ProfileStats({
  projectCount,
  followers,
  following
}: {
  projectCount: number;
  followers: string | null;
  following: string | null;
}) {
  return <p className="flex items-center gap-4 text-[11px] leading-none text-[var(--text-secondary)]">
      <span><span className="font-semibold tabular-nums text-[var(--text-primary)]">{projectCount}</span> {projectCount === 1 ? 'project' : 'projects'}</span>
      <span><span className="font-semibold tabular-nums text-[var(--text-primary)]">{followers ?? '0'}</span> followers</span>
      <span><span className="font-semibold tabular-nums text-[var(--text-primary)]">{following ?? '0'}</span> following</span>
    </p>;
}

export function UserProfilePage({
  profile,
  onBack,
  viewerRole,
  follow,
  onSignInRequest,
  onOpenProject,
  onEditProfile,
  shareUrl,
  isSharedView = false,
  onAddCategory,
  onOpenActivity
}: UserProfilePageProps) {
  const [columnsPerRow, setColumnsPerRow] = useState(readProfileDensity);
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  // This page renders portfolio media from canonical projects and nothing else.
  // It used to keep its own list of picked image files as object URLs and show
  // them as tiles beside the real work — a second, parallel way for media to
  // reach a profile that bypassed projects, publishing, and the media services
  // entirely, and that vanished on reload. Media now enters only through the
  // publishing flow.
  const showsOwnerTools = canAuthor(viewerRole);
  const projectManagement = useProjectManagement(showsOwnerTools ? profile.id : null);
  const [isReorderingProjects, setIsReorderingProjects] = useState(false);
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
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement>(null);
  // A creator does not follow themselves, and a guest is told an account is
  // needed rather than shown a control that quietly fails.
  const showsFollow = viewerRole === 'visitor';
  const showsSignInToFollow = needsAccount(viewerRole);
  const displayName = profile.name;
  const profileLinks = useMemo(() => mergeProfileLinks(profile.links, profile.socialLinks), [profile.links, profile.socialLinks]);
  useEffect(() => {
    if (!isManageOpen) {
      return;
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!manageMenuRef.current?.contains(event.target as Node)) {
        setIsManageOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsManageOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isManageOpen]);
  useEffect(() => {
    if (!isAvatarPreviewOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsAvatarPreviewOpen(false);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isAvatarPreviewOpen]);
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
  const imageryCells: WallItem[] = useMemo(() => orderedCardProjects.map((project) => ({
    key: project.id,
    ratio: getProjectAspectRatio(project),
    content: <div className="relative h-full w-full">
          <ProfileProjectTile
            project={project}
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
            onEditCover={showsOwnerTools && !isSharedView && !isReorderingProjects && projectManagement.editor.projectId === null ? () => projectManagement.editor.open(project.id, 'cover') : undefined}
            onReplaceFiles={showsOwnerTools && !isSharedView && !isReorderingProjects && projectManagement.editor.projectId === null ? () => projectManagement.editor.openFiles(project.id) : undefined}
          />
        </div>
  })), [orderedCardProjects, onOpenProject, isSharedView, showsOwnerTools, isReorderingProjects, projectManagement.editor]);
  const followers = readStat(profile, 'Followers');
  const following = readStat(profile, 'Following');
  // Every region of the page — toolbar, identity, and wall — now sits on the
  // same 8px edge, so their left and right boundaries agree and the page uses
  // the whole area rather than holding a margin the wall no longer keeps.
  // A genuinely sparse row keeps its card cap so one item doesn't balloon to
  // fill the page. A full row of the chosen column count expands evenly into
  // whatever width the shell currently has.
  const fitsInOneRow = imageryCells.length < columnsPerRow;
  const gridWidth = fitsInOneRow ? columnsPerRow * MAX_CARD_WIDTH + (columnsPerRow - 1) * GRID_GAP : undefined;
  // One continuous document: the toolbar, identity, divider, and grid all sit in
  // normal flow inside the app shell's single scroll container. Nothing here
  // pins, and nothing scrolls independently.
  return <div className="user-profile-canvas flex min-h-full w-full flex-col text-[var(--text-primary)]">
      {isSharedView && <header className="user-profile-canvas ps-panel-toolbar w-full">
          <section aria-label={`${displayName} information`} className="flex min-h-16 w-full items-center px-3 py-2 text-left">
            <ProfileIdentityAndLinks profile={profile} displayName={displayName} links={profileLinks} onAvatarOpen={profile.avatar ? () => setIsAvatarPreviewOpen(true) : undefined} />
          </section>
        </header>}
      {/* One 8px rhythm through the strip, and it shares the content column's
         width so its rule lines up with every rule and card edge below it. */}
      {/* The toolbar material creates its own stacking context. Keep that local
          context above the identity/link row so menus opened from the toolbar
          cover later content instead of letting its icon buttons paint through. */}
      {!isSharedView && <header className="user-profile-canvas ps-panel-toolbar global-control-header relative z-20 w-full px-2">
        <div className="flex h-full w-full items-center gap-4">
          <button type="button" onClick={onBack} aria-label="Go back" className="shape-compact inline-flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={ArrowLeftIcon} weight="medium" mirroredInRtl />
            </button>
          {/* Audience figures sit in the toolbar rather than the header below, so
             the header's fact area stays about the work itself. They read from
             the record — a profile carrying no figure shows none rather than a
             fabricated zero — and they are shown to every viewer, because an
             audience count is part of how a creator presents themselves. */}
          <ProfileStats projectCount={projectCount} followers={followers} following={following} />
          {/* Pending requests sit with the audience figures, because that is what
             they are about to change — and only the creator being asked ever
             sees them. The count is the service's own answer: nothing is shown
             while the read is in flight or if it failed, because a number the
             list behind it cannot substantiate is worse than none. Zero is a
             real answer, so the control simply is not offered. */}
          {showsOwnerTools && visibility.isPrivate && followRequests.count > 0 && <div className="relative">
              <button type="button" data-follow-requests-control="" data-system-color="" onClick={() => setIsRequestsOpen((open) => !open)} aria-expanded={isRequestsOpen} aria-haspopup="dialog" aria-label={`${followRequests.count} pending follow ${followRequests.count === 1 ? 'request' : 'requests'}`} className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--social-unread)] px-3 text-[11px] font-semibold text-[var(--social-unread)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
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
          {/* Activity and owner controls read as one right-hand cluster. */}
          <div className="ml-auto flex items-center gap-3">
            {/* A signed-in visitor can follow. A guest is told plainly that this
               needs an account rather than being shown a control that silently
               fails, and reading the work stays open either way. */}
            {/* The control appears once the service has answered, and is withheld
               if that read failed — a button that cannot state the truth about
               whether the viewer follows this creator is worse than none. While a
               change is in flight it is disabled, so one press cannot become two
               requests, and the label keeps showing the last confirmed state
               rather than a state the service has not agreed to. */}
            {showsFollow && follow && !follow.resolveError && <span className="inline-flex items-center gap-2">
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
                <button type="button" onClick={follow.onToggle} disabled={follow.isResolving || follow.isPending} aria-pressed={follow.isFollowing || follow.isRequested} aria-busy={follow.isPending || undefined} aria-label={follow.isFollowing ? `Unfollow ${displayName}` : follow.isRequested ? `Withdraw your follow request to ${displayName}` : visibility.isPrivate ? `Request to follow ${displayName}` : `Follow ${displayName}`} className={`flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60 ${follow.isFollowing ? 'border border-transparent bg-[var(--accent-primary)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]' : 'border border-[var(--hairline-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}>
                  {follow.isRequested && !follow.isPending && <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {follow.isPending ? 'Working…' : follow.isFollowing ? 'Following' : follow.isRequested ? 'Requested' : visibility.isPrivate ? 'Request' : 'Follow'}
                </button>
                {follow.mutationError && <span role="alert" className="flex items-center gap-1.5 text-[11px] leading-none text-[var(--text-secondary)]">
                    {follow.mutationError}
                    {follow.onRetry && <button type="button" onClick={follow.onRetry} className="font-semibold text-[var(--text-primary)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>}
                  </span>}
              </span>}
            {showsSignInToFollow && onSignInRequest && <button type="button" onClick={onSignInRequest} className="flex h-7 items-center rounded-full border border-[var(--hairline-strong)] px-3.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                Sign in to follow
              </button>}
            {showsOwnerTools && onOpenActivity ? <div role="group" aria-label="Profile engagement collections" className="flex items-center gap-2">
                {ENGAGEMENT_KINDS.map((kind) => {
              const Icon = ACTIVITY_ICONS[kind];
              const labels = describeActivityCollection(kind);
              const color = ACTIVITY_COLORS[kind];
              return <button key={kind} type="button" data-semantic-action="engagement-collection" onClick={() => onOpenActivity(kind)} aria-label={`Open ${labels.title}`} title={labels.title} className="shape-compact inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--hairline-strong)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                    <InterfaceIcon icon={Icon} size="sm" weight="medium" keepColor stroke={color} style={{ color }} />
                  </button>;
            })}
              </div> : null}
            {showsOwnerTools && shareUrl ? <ProfileShareMenu shareUrl={shareUrl} /> : null}
            {showsOwnerTools && onEditProfile ? <button type="button" onClick={onEditProfile} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--hairline-strong)] px-3 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={PencilIcon} size="sm" weight="medium" opticalOffset={{ y: -0.25 }} />
                Edit profile
              </button> : null}
            {showsOwnerTools ? <div ref={manageMenuRef} className="relative">
                <button type="button" onClick={() => setIsManageOpen((open) => !open)} aria-expanded={isManageOpen} aria-haspopup="menu" className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--hairline-strong)] px-3 text-[11px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  <InterfaceIcon icon={Settings2Icon} size="sm" weight="medium" />
                  Manage
                  <InterfaceIcon icon={ChevronDownIcon} size="xs" weight="medium" className={`transition-transform duration-150 ${isManageOpen ? 'rotate-180' : ''}`} />
                </button>
                {isManageOpen ? <div role="menu" aria-label="Profile management" className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-pop)]">
                    <div className="flex min-h-10 items-center gap-3 rounded-[8px] px-2.5">
                      <label htmlFor="profile-view-density" className="min-w-0 flex-1 text-[12px] font-medium text-[var(--text-primary)]">View density</label>
                      <input id="profile-view-density" type="range" min={MIN_COLUMNS} max={MAX_COLUMNS} step={1} value={columnsPerRow} onChange={(event) => setColumnsPerRow(writeProfileDensity(Number(event.target.value)))} aria-label="Cards per row" aria-valuetext={`${columnsPerRow} cards per row`} className="h-1 w-16 cursor-pointer accent-[var(--accent-primary)]" />
                    </div>
                    <button type="button" role="menuitem" disabled={orderedCardProjects.length < 2 || projectOrder.isSaving || projectManagement.editor.projectId !== null} onClick={() => {
                  projectOrder.reset();
                  setIsReorderingProjects(true);
                  setIsManageOpen(false);
                }} className="flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45">
                      <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
                      Reorder projects
                    </button>
                    <button type="button" role="menuitem" onClick={visibility.onToggle} disabled={visibility.isPending} aria-pressed={visibility.isPrivate} aria-busy={visibility.isPending || undefined} className="flex min-h-10 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[12px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
                      <InterfaceIcon icon={LockIcon} size="sm" weight="medium" />
                      <span className="min-w-0 flex-1">Account visibility</span>
                      <span className="text-[11px] text-[var(--text-secondary)]">{visibility.isPending ? 'Working…' : visibility.isPrivate ? 'Private' : 'Public'}</span>
                    </button>
                    {visibility.error ? <p role="alert" className="px-2.5 py-1.5 text-[11px] leading-snug text-[var(--status-danger)]">
                        {visibility.error} {visibility.onRetry ? <button type="button" onClick={visibility.onRetry} className="font-semibold underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button> : null}
                      </p> : null}
                    {onAddCategory ? <button type="button" role="menuitem" onClick={() => {
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

      {/* Naming the category and choosing its mark happens before the record is
         created, so an abandoned attempt leaves nothing behind. */}
      {isAddingCategory && onAddCategory && <NewCategoryDialog onCancel={() => setIsAddingCategory(false)} onCreate={(label, iconName) => {
      onAddCategory(label, iconName);
      setIsAddingCategory(false);
    }} />}

      {isReorderingProjects && showsOwnerTools && !isSharedView ? <section aria-label="Reorder projects" className="mx-2 mt-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-[var(--surface-raised)] px-3 py-2.5 shadow-[var(--shadow-pop)] ring-1 ring-inset ring-[var(--hairline)]">
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

      {!isSharedView && <div className="w-full px-2 pt-3">
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
          <ProfileIdentityAndLinks profile={profile} displayName={displayName} links={profileLinks} onAvatarOpen={profile.avatar ? () => setIsAvatarPreviewOpen(true) : undefined} />
        </section>

        
      </div>}

      {/* The work grows the page rather than scrolling inside it, so the grid's
         height is simply its content and the page-level scroll carries it. The
         content region takes the remaining column height, so a short or empty
         collection still carries the page surface to the bottom. */}
      {/* The wall runs edge to edge with only its own gutter: the page margin
         belongs to the identity and toolbar above, where the type sits on it.
         Holding the photographs off the same margin only narrowed the rows and
         left the sides of the page bare. */}
      <main className="w-full flex-1 px-2 pb-8 pt-1" aria-labelledby="preview-title">
        {imageryCells.length === 0 ? <EmptyState title="No work published yet" description={showsOwnerTools ? 'Open a category, then choose Add project to publish the first one.' : `${displayName} has not published any work yet.`} /> : <div className="w-full" style={{
        maxWidth: gridWidth ? `${gridWidth}px` : undefined
      }}>
            {/* Equal-width columns left dead space: a row took the height of its
             tallest frame, and a landscape photograph left a band empty
             beneath it. The wall justifies by ROW instead — every row is
             scaled to span the full width and rows sit flush against each
             other, so no gap is left anywhere. Widths differ within a row
             because the proportions differ; nothing is cropped or stretched.
             Each published image is also the direct entrance to the project it
             represents; the image itself remains visually unchanged at rest.
             A short trailing row ends naturally. */}
            <JustifiedImageWall label={`${displayName} — profile imagery`} columns={columnsPerRow} items={imageryCells} reorderMode={isReorderingProjects ? {
          enabled: true,
          disabled: projectOrder.isSaving,
          onMove: projectOrder.move,
          onMoveByOffset: projectOrder.moveByOffset
        } : undefined} />
          </div>}
      </main>
      {isAvatarPreviewOpen && profile.avatar ? <ModalPortal><div role="presentation" className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[var(--surface-overlay)] p-6" onClick={(event) => {
      if (event.target === event.currentTarget) setIsAvatarPreviewOpen(false);
    }}>
          <div role="dialog" aria-modal="true" aria-labelledby="profile-avatar-preview-title" data-avatar-preview="" className="flex max-w-full flex-col items-center" style={{
          maxHeight: 'calc(100dvh - 48px)'
        }}>
            <div className="squircle relative overflow-hidden bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]" style={{
            width: 'clamp(148px, 22vw, 240px)',
            height: 'clamp(148px, 22vw, 240px)'
          }}>
              <ResponsiveImage src={profile.avatar} alt={`${displayName} profile image`} priority width={480} height={480} sizes="(min-width: 1100px) 240px, max(148px, 22vw)" className="block h-full w-full object-cover" />
              <button type="button" autoFocus onClick={() => setIsAvatarPreviewOpen(false)} aria-label="Close profile image" className="shape-compact absolute right-2 top-2 flex h-9 w-9 items-center justify-center bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-pop)] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                <InterfaceIcon icon={XIcon} size="sm" weight="medium" />
              </button>
            </div>
            <h2 id="profile-avatar-preview-title" className="mt-4 max-w-[min(84vw,520px)] px-2 pb-1 text-center font-sans text-large font-medium leading-tight tracking-[-0.02em] text-[var(--text-primary)]">
              {displayName}
            </h2>
          </div>
        </div></ModalPortal> : null}
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
