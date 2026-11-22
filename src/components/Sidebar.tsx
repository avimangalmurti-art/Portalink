import { motionSeconds, motionCurve } from '../presentation/motion/motion';
import { SavedChangeNotice } from './ui/SavedChangeNotice';
import { MobileNavigation } from '../presentation/mobile/MobileNavigation';
import { usePresentation } from '../presentation/usePresentation';
import { useCompactNavigation } from '../hooks/useCompactNavigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BellIcon, BookmarkIcon } from 'lucide-react';
import { buildPath } from '../app/routes';
import type { NavigationDestination } from './navigation';
// Canonical domain models. The seed module's parallel copies stay behind the
// mock service; production-facing components read the real contract.
import type { Profile, PortfolioCategory as ProfileCategory } from '../types/domain';
import { getCategoryIcon } from './profile/categoryIcons';
import type { CategoryManagement } from '../features/profile/useCategoryManagement';
import { applyPortalOrder, portalChildren, portalRootId } from '../features/profile/portalHierarchy';
import type { CategoryDeletionCapability } from '../types/domain';
import { AlbumIcon, AlertCircleIcon, SatelliteDishIcon, ChartNoAxesColumnIcon, CheckIcon, Loader2Icon, ChevronDownIcon, ChevronRightIcon, CircleUserRoundIcon, Clock3Icon, Disc3Icon, DoorOpenIcon, Gamepad2Icon, HeartIcon, SearchIcon, LayersIcon, LayoutGridIcon, ListMusicIcon, MessageCircleIcon, Music2Icon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlayIcon, PlusIcon, UserSearchIcon, SettingsIcon, SunIcon, MoonIcon, TypeIcon, UserRoundIcon, ShapesIcon } from 'lucide-react';
import { PortalRingIcon } from './PortalRingIcon';
import { NewCategoryDialog } from './profile/NewCategoryDialog';
import { CategoryOptionsMenu } from './profile/CategoryOptionsMenu';
import { InterfaceIcon } from './ui/InterfaceIcon';
import type { InterfaceIconSource } from './ui/InterfaceIcon';
import { ResizablePanelHandle, useResizablePanelWidth } from './ui/ResizablePanelHandle';
import { panelLayoutDefaults } from '../utils/panelLayoutDefaults';
type NavItem = {
  label: NavigationDestination;
  displayLabel: string;
  icon: InterfaceIconSource;
};
type SidebarProps = {
  isHomeActive: boolean;
  isSearchActive: boolean;
  onSearchOpen?: () => void;
  isPortalinkActive: boolean;
  accentColor: string;
  /**
   * The sidebar carries no appearance controls of its own: Control Center owns
   * the browser preferences and Account Settings owns the authenticated ones, so
   * the only thing it needs is the accent every row resolves its selected state
   * from, plus the two openers below.
   */
  onControlCenterOpen: () => void;
  /** The account menu reflects the actual session rather than a fixed label. */
  isAuthenticated: boolean;
  isAuthActionPending: boolean;
  accountName?: string;
  accountAvatar?: string | null;
  onSignIn: () => void;
  onSignOut: () => Promise<boolean>;
  onPortalinkOpen: () => void;
  /**
   * A request from the profile page to create a category, carrying the title the
   * owner typed. `nonce` distinguishes repeat requests for the same name.
   */
  addCategoryRequest: {
    nonce: number;
    label: string;
    /** The mark the owner chose, written with the record rather than after it. */
    iconName?: string;
  } | null;
  liveShow: string | null;
  onLeaveShow: () => void;
  /**
   * The owner's portfolio-management boundary. Owned by the app shell rather than
   * created here, so the icon picker — which lives on the page, not in the sidebar
   * — writes through the same instance, and shares its pending state, failure
   * message, and retry.
   */
  management: CategoryManagement;
  onChangeCategoryIcon: (categoryId: string) => void;
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onNavigate: (destination: NavigationDestination) => void;
  onProfileOpen: () => void;
  /** Canonical profile address; when present, profile access works before hydration. */
  profileHref?: string;
  /** Contextual MOBILE compose action beside the navigation capsule. */
  /**
   * Opens the profile currently being VIEWED, which is not always the viewer's
   * own. The portal row names that creator, so it must land on them.
   */
  onMessagesOpen: (recipientProfileId?: string, fromDock?: boolean) => void;
  /** The resolved appearance, so the toggle can name the one it switches to. */
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  /** Messages is its own destination, so the figure reports when it is open. */
  isMessagesActive?: boolean;
  isInsightsActive?: boolean;
  isActivityActive?: boolean;
  isSavedActive?: boolean;
  isStudioActive?: boolean;
  isPortalSearchActive?: boolean;
  /** True only when the signed-in user's own profile overview is open. */
  isProfileActive?: boolean;
  /**
   * The portfolio in context, once the read boundary has confirmed it. Null while
   * it is being read, when it could not be read, and for a guest with no creator
   * context — the portfolio section is then absent rather than filled with a
   * profile nobody asked for.
   */
  viewedProfile: Profile | null;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  isOwnerMode: boolean;
};
const libraryItems = [{
  label: 'Recently Added',
  icon: Clock3Icon
}, {
  label: 'Artists',
  icon: UserRoundIcon
}, {
  label: 'Albums',
  icon: AlbumIcon
}, {
  label: 'Saved Pieces',
  icon: HeartIcon
}];
const playlists = ['All Playlists', 'Late Night Selects', 'Studio Rotation', 'Heavy Club', 'Instrumentals', 'Minimal'];
function NavRow({
  item,
  isActive,
  accentColor,
  onNavigate





}: {item: NavItem;isActive: boolean;accentColor: string;onNavigate: (destination: NavigationDestination) => void;}) {
  const Icon = item.icon;
  return <button type="button" onClick={() => onNavigate(item.label)} aria-current={isActive ? 'page' : undefined} className={`sidebar-pill-row relative flex h-10 w-full items-center gap-2.5 px-3 text-left text-small transition-colors focus:outline-none ${isActive ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-pressed)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
      <InterfaceIcon icon={Icon} weight="medium" />
      <span className="cdx-dense-label min-w-0 flex-1" title={item.displayLabel}>{item.displayLabel}</span>
    </button>;
}
function NavTile({
  label, icon: Icon, isActive, onSelect, href, ariaLabel, title, disabled = false, compact = false,
}: { label: string; icon: InterfaceIconSource; isActive: boolean; onSelect?: () => void; href?: string; ariaLabel?: string; title?: string; disabled?: boolean; compact?: boolean; }) {
  const className = `desktop-navigation-item nav-button ${compact ? 'desktop-navigation-icon sidebar-rail-slot' : 'desktop-navigation-row'} ${isActive ? 'font-semibold' : 'font-medium'}`;
  const content = <><InterfaceIcon icon={Icon} size="sm" weight="medium" />{!compact && <span className="desktop-navigation-label">{label}</span>}</>;
  const attributes = { className, 'aria-label': ariaLabel ?? `Open ${label}`, title: title ?? label, 'aria-current': !disabled && isActive ? 'page' as const : undefined };
  return href && !disabled
    ? <Link {...attributes} to={href}>{content}</Link>
    : <button {...attributes} type="button" disabled={disabled} onClick={disabled ? undefined : onSelect}>{content}</button>;
}

function PersonalNavigationTile({ destination, collapsed = false, active }: { destination: 'notifications' | 'insights' | 'studio' | 'portalSearch'; collapsed?: boolean; active: boolean; }) {
  const label = destination === 'notifications' ? 'Activity' : destination === 'insights' ? 'Insights' : destination === 'studio' ? 'Studio' : 'Portal search';
  const Icon = destination === 'notifications' ? BellIcon : destination === 'insights' ? ChartNoAxesColumnIcon : destination === 'studio' ? ShapesIcon : PortalRingIcon;
  return <NavTile label={label} icon={Icon} isActive={active} href={buildPath(destination)} compact={collapsed} />;
}

function SettingsTrigger({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label="Open settings" title="Settings" className={`desktop-navigation-item nav-button ${collapsed ? 'desktop-navigation-icon sidebar-rail-slot' : 'desktop-navigation-row'}`}>
    <InterfaceIcon icon={SettingsIcon} size="sm" weight="medium" />{!collapsed && <span className="desktop-navigation-label">Settings</span>}
  </button>;
}
function CategoryRowContent({
  category,
  isActive,
  accentColor,
  theme,
  isDraggable,
  isHidden = false,
  isRenaming = false,
  isBusy = false,
  showOptions = false,
  readDeletionCapability,
  onSelect,
  onKeyDown,
  onDragHandlePointerDown,
  onHideToggle,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onChangeIcon,
  onDelete


























}: {category: ProfileCategory;isActive: boolean;accentColor: string;theme: 'light' | 'dark';isDraggable: boolean;isHidden?: boolean;isRenaming?: boolean; /** An operation on THIS row is in flight, so its controls stand down. */isBusy?: boolean;showOptions?: boolean; /** Asked when the confirmation opens, so the answer comes from the store. */readDeletionCapability?: () => Promise<CategoryDeletionCapability>;onSelect: () => void;onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;onDragHandlePointerDown?: (event: React.PointerEvent) => void;onHideToggle?: () => void;onRenameStart?: () => void;onRenameCommit?: (label: string) => void;onRenameCancel?: () => void;onChangeIcon?: () => void; /** Removes the category from the portfolio. Owner-only, destructive. */onDelete?: () => void | boolean | Promise<void | boolean>;}) {
  const Icon = getCategoryIcon(category.iconName);
  const [draftLabel, setDraftLabel] = useState(category.label);
  useEffect(() => {
    setDraftLabel(category.label);
  }, [category.label]);
  return <div className={`side-panel-row group/row relative mb-[var(--side-panel-row-gap)] w-full ${isHidden ? 'opacity-50' : ''}`}>
      {/* A category is a destination inside the active product area, so its
         selected state is a quieter version of the primary nav's accent. */}
      <button type="button" data-category-row="" onClick={onSelect} onKeyDown={onKeyDown} aria-current={isActive ? 'page' : undefined} aria-describedby={isDraggable ? 'portfolio-reorder-hint' : undefined} className={`ps-list-btn sidebar-pill-row flex h-full w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[var(--m-base)]  ease-[var(--m-enter)] focus:outline-none ${isActive ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
        {/* Consistent icon column, secondary to the label. The glyph is never
           removed or dimmed away — selection recolours it, nothing more. */}
        <span aria-hidden="true" data-icon-tile="" onPointerDown={isDraggable ? onDragHandlePointerDown : undefined} className={`flex h-4 w-6 shrink-0 items-center justify-center ${isDraggable ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}>
          <InterfaceIcon icon={Icon} weight="medium" />
        </span>
        {/* Enter commits, Escape abandons the edit outright rather than saving
           the old name back, and blur commits so a click elsewhere does not
           quietly discard what was typed. A rejected name keeps the field open
           with its reason, so nothing entered is ever lost to a failure. */}
        {isRenaming ? <input autoFocus disabled={isBusy} value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} onClick={(event) => event.stopPropagation()} onBlur={() => onRenameCommit?.(draftLabel)} onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          onRenameCommit?.(draftLabel);
        }
        if (event.key === 'Escape') {
          setDraftLabel(category.label);
          onRenameCancel?.();
        }
      }} aria-label={`Rename ${category.label}`} maxLength={60} className="text-control min-w-0 flex-1 px-1.5 py-1 text-small font-medium text-[var(--text-primary)]" /> : <span className="cdx-dense-label min-w-0 flex-1 py-0.5" title={category.label}>{category.label}</span>}
        <span className="flex w-6 shrink-0 items-center justify-center" aria-hidden="true">
          {isBusy && <Loader2Icon className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]" />}
        </span>
      </button>

      {/* The mark is quiet until the row is under the pointer, so the list reads
         as names rather than a column of controls. It stays present for the
         keyboard — focus within the row reveals it — and it holds while its own
         menu is open, so the control does not vanish out from under the menu it
         opened. */}
      {showOptions && <CategoryOptionsMenu category={category} accentColor={accentColor} theme={theme} isHidden={isHidden} isBusy={isBusy} readDeletionCapability={readDeletionCapability} onHideToggle={onHideToggle} onRenameStart={onRenameStart} onChangeIcon={onChangeIcon} onDelete={onDelete} />}
    </div>;
}
function DraggableCategoryRow({
  category,
  isActive,
  accentColor,
  theme,
  isHidden,
  isRenaming,
  isBusy,
  isReorderDisabled,
  readDeletionCapability,
  onSelect,
  onMoveByKeyboard,
  onReorderCommit,
  onHideToggle,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onChangeIcon,
  onDelete





















}: {category: ProfileCategory;isActive: boolean;accentColor: string;theme: 'light' | 'dark';isHidden: boolean;isReorderDisabled: boolean;isRenaming: boolean;isBusy: boolean;readDeletionCapability: () => Promise<CategoryDeletionCapability>;onSelect: () => void;onMoveByKeyboard: (categoryId: string, direction: -1 | 1) => void;onReorderCommit: () => void;onHideToggle: () => void;onRenameStart: () => void;onRenameCommit: (label: string) => void;onRenameCancel: () => void;onChangeIcon: () => void;onDelete: () => void;}) {
  const shouldReduceMotion = useReducedMotion();
  const dragControls = useDragControls();
  const isDraggingRef = useRef(false);
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (isReorderDisabled || !event.altKey) {
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onMoveByKeyboard(category.id, event.key === 'ArrowUp' ? -1 : 1);
    }
  }
  return <Reorder.Item value={category.id} id={category.id} dragListener={false} dragControls={dragControls} layout="position" transition={{
    duration: shouldReduceMotion ? 0 : motionSeconds('base'),
    ease: motionCurve()
  }} whileDrag={{
    zIndex: 30,
    boxShadow: '0 10px 24px rgba(0,0,0,0.16)'
  }} onDragStart={() => {
    isDraggingRef.current = true;
  }} onDragEnd={() => {
    onReorderCommit();
    window.setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  }} className="relative list-none">
      <div>
        <CategoryRowContent category={category} isActive={isActive} accentColor={accentColor} theme={theme} isDraggable={!isReorderDisabled} isHidden={isHidden} isRenaming={isRenaming} isBusy={isBusy} showOptions readDeletionCapability={readDeletionCapability} onDragHandlePointerDown={(event) => dragControls.start(event)} onSelect={() => {
        if (isDraggingRef.current) {
          return;
        }
        onSelect();
      }} onKeyDown={handleKeyDown} onHideToggle={onHideToggle} onRenameStart={onRenameStart} onRenameCommit={onRenameCommit} onRenameCancel={onRenameCancel} onChangeIcon={onChangeIcon} onDelete={onDelete} />
      </div>
    </Reorder.Item>;
}
function SidebarSection({
  id,
  label,
  children




}: {id: string;label: string;children: React.ReactNode;}) {
  // A small structural heading, not another navigation item.
  return <section className="flex min-h-0 flex-col px-0 pb-0 pt-0" aria-label={label}>
      {/* The heading is rendered by the caller, immediately above the list it
         names, so the identity row can sit above it. The section still carries
         the name for assistive tech. */}
      <div id={id} className="flex min-h-0 flex-col overflow-hidden">
        {children}
      </div>
    </section>;
}

function getPortalsHeading(profile: Profile, isOwner: boolean): string {
  if (isOwner) {
    return 'My Portals';
  }
  const name = profile.name.trim();
  return `${name}${/s$/i.test(name) ? "'" : "'s"} Portals`;
}

export function Sidebar({
  isHomeActive,
  isSearchActive,
  onSearchOpen,
  isPortalinkActive,
  accentColor,
  onControlCenterOpen,
  isAuthenticated,
  isAuthActionPending,
  accountName,
  accountAvatar,
  onSignIn,
  onPortalinkOpen,
  addCategoryRequest,
  liveShow,
  onLeaveShow,
  management,
  onChangeCategoryIcon,
  isCollapsed: preferredSidebarCollapsed,
  onCollapsedChange,
  onNavigate,
  onProfileOpen,
  profileHref,
  onMessagesOpen,
  theme,
  onThemeChange,
  isMessagesActive = false,
  isInsightsActive = false,
  isActivityActive = false,
  isSavedActive = false,
  isStudioActive = false,
  isPortalSearchActive = false,
  isProfileActive = false,
  viewedProfile,
  activeCategoryId,
  onCategorySelect,
  isOwnerMode
}: SidebarProps) {
  const isMobile = usePresentation() === 'mobile';
  const compactNavigation = useCompactNavigation(preferredSidebarCollapsed, onCollapsedChange);
  const isSidebarCollapsed = compactNavigation.collapsed;
  const mainSidebarWidth = useResizablePanelWidth({
    id: 'main-navigation',
    defaultWidth: panelLayoutDefaults.navigation,
    minWidth: 260,
    maxWidth: 360,
    viewportReserve: 340
  });
  const portalsHeading = viewedProfile ? getPortalsHeading(viewedProfile, isOwnerMode) : 'Portals';
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isAddingPortal, setIsAddingPortal] = useState(false);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  /*
   * The category list's edge fade. Written straight to the class list rather
   * than through state: it is pure presentation driven by scroll position, and
   * re-rendering the whole sidebar on every scroll frame would be wasteful.
   */
  const categoryScrollRef = useRef<HTMLElement | null>(null);
  const syncCategoryScrollEdges = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }
    const {
      scrollTop,
      scrollHeight,
      clientHeight
    } = element;
    element.classList.toggle('is-at-top', scrollTop <= 1);
    element.classList.toggle('is-at-bottom', scrollTop + clientHeight >= scrollHeight - 1);
  }, []);
  const handleCategoryScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    syncCategoryScrollEdges(event.currentTarget);
  }, [syncCategoryScrollEdges]);
  // A list that grows or shrinks changes whether it overflows at all, so the
  // edges are re-read when the categories change rather than only on scroll.
  useEffect(() => {
    syncCategoryScrollEdges(categoryScrollRef.current);
  });
  // Order and the hidden set are the arrangement's business; the categories
  // themselves come from the canonical record, so a rename or a deletion is
  // reflected here without a second copy to keep in sync.
  const hiddenCategoryIds = useMemo(() => management.arrangement?.hiddenCategoryIds ?? [], [management.arrangement]);
  const orderedCategories = useMemo(() => {
    // No profile in context means no portfolio to arrange — an empty list, not a
    // stand-in one.
    const categories = viewedProfile?.categories ?? [];
    const order = management.arrangement?.categoryOrder;
    if (!order) {
      return categories;
    }
    const ranked = order.map((id) => categories.find((category) => category.id === id)).filter((category): category is ProfileCategory => Boolean(category));
    // A category the arrangement has not caught up with still appears, so a new
    // one is never invisible while its order is saving.
    return [...ranked, ...categories.filter((category) => !order.includes(category.id))];
  }, [management.arrangement, viewedProfile]);
  /*
   * Adding a category creates a real record under the name the owner gave it.
   * It used to create one called "New category" and drop the row into renaming,
   * which meant a placeholder record existed — and stayed — if the owner walked
   * away mid-rename. The name is now collected BEFORE the write, so nothing is
   * created until there is something to call it.
   */
  async function addCategory(label: string, iconName?: string) {
    const created = await management.createCategory(label, iconName);
    if (created) {
      handleCategorySelect(created.id);
    }
  }
  async function commitRename(categoryId: string, label: string) {
    const saved = await management.renameCategory(categoryId, label);
    if (saved) {
      setRenamingCategoryId(null);
    }
    // A rejected name keeps the row in edit mode with the reason attached, so the
    // typed value is never discarded by a failure.
  }
  async function deleteCategory(categoryId: string) {
    const deleted = await management.deleteCategory(categoryId);
    if (!deleted) {
      return false;
    }
    // Deleting the category you are viewing moves you to the next one, so the
    // workspace is never left pointing at something that no longer exists.
    if (activeCategoryId === categoryId) {
      const remaining = orderedCategories.filter((category) => category.id !== categoryId);
      const nextCategory = remaining.find((category) => !hiddenCategoryIds.includes(category.id)) ?? remaining[0];
      if (nextCategory) {
        handleCategorySelect(nextCategory.id);
      }
    }
    setRenamingCategoryId((current) => current === categoryId ? null : current);
    return true;
  }
  // The owner adds categories from their profile page; that request lands here.
  useEffect(() => {
    if (addCategoryRequest) {
      void addCategory(addCategoryRequest.label, addCategoryRequest.iconName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addCategoryRequest?.nonce]);
  function decorateCategory(category: ProfileCategory): ProfileCategory {
    return {
      ...category,
      iconName: management.categoryIcons[category.id] ?? category.iconName
    };
  }
  // Hidden categories sink to the bottom of the list.
  const arrangedCategories = useMemo(() => [...orderedCategories.filter((category) => !hiddenCategoryIds.includes(category.id)), ...orderedCategories.filter((category) => hiddenCategoryIds.includes(category.id))], [hiddenCategoryIds, orderedCategories]);
  const arrangedCategoryIds = useMemo(() => arrangedCategories.map((category) => category.id), [arrangedCategories]);
  const rootCategories = useMemo(() => portalChildren(arrangedCategories), [arrangedCategories]);
  const rootCategoryIds = useMemo(() => rootCategories.map(category => category.id), [rootCategories]);
  const activeRootCategoryId = useMemo(() => portalRootId(orderedCategories, activeCategoryId ?? null), [orderedCategories, activeCategoryId]);
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[] | null>(null);
  const draftCategoryIdsRef = useRef<string[] | null>(null);

  // Dragging is presentation-only until the pointer is released. Framer emits
  // many reorder frames during one gesture; saving each frame races Supabase and
  // can leave an earlier intermediate order as the durable one.
  useEffect(() => {
    setDraftCategoryIds((current) => {
      if (current === null) return null;
      const known = new Set(rootCategoryIds);
      const retained = (current ?? []).filter((id) => known.has(id));
      const merged = [...retained, ...rootCategoryIds.filter((id) => !retained.includes(id))];
      draftCategoryIdsRef.current = merged;
      return merged;
    });
  }, [rootCategoryIds]);

  const displayedCategories = useMemo(() => {
    if (!draftCategoryIds) {
      return rootCategories;
    }
    const byId = new Map(rootCategories.map((category) => [category.id, category]));
    return draftCategoryIds.map((id) => byId.get(id)).filter((category): category is ProfileCategory => Boolean(category));
  }, [rootCategories, draftCategoryIds]);
  const displayedCategoryIds = useMemo(() => displayedCategories.map((category) => category.id), [displayedCategories]);
  const isCategoryReorderDisabled = management.isLoadingArrangement || !management.arrangement || management.pending !== null;

  function updateDraftCategoryOrder(nextIds: string[]) {
    draftCategoryIdsRef.current = nextIds;
    setDraftCategoryIds(nextIds);
  }

  async function commitDraftCategoryOrder(nextIds = draftCategoryIdsRef.current) {
    try { if (nextIds && !isCategoryReorderDisabled) await management.reorderCategories(applyPortalOrder(arrangedCategoryIds, nextIds)); }
    finally { draftCategoryIdsRef.current = null; setDraftCategoryIds(null); }
  }

  function moveCategory(categoryId: string, direction: -1 | 1) {
    if (isCategoryReorderDisabled) {
      return;
    }
    const currentIndex = displayedCategories.findIndex((item) => item.id === categoryId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= displayedCategories.length) {
      return;
    }
    const nextItems = [...displayedCategories];
    const [movedItem] = nextItems.splice(currentIndex, 1);
    nextItems.splice(nextIndex, 0, movedItem);
    const nextIds = nextItems.map((item) => item.id);
    updateDraftCategoryOrder(nextIds);
    void commitDraftCategoryOrder(nextIds);
  }
  const [isPlaylistsOpen, setIsPlaylistsOpen] = useState(false);
  function toggleCollapsed() {
    compactNavigation.toggle();
  }
  function handleNavigate(destination: NavigationDestination) {
    compactNavigation.closeCompact();
    onNavigate(destination);
  }
  // Exactly one sidebar target reads as selected. Resolving it once, in
  // priority order, is what stops two rows lighting up at the same time.
  const activeTarget: 'messages' | 'search' | 'portalink' | 'home' | 'category' | 'profile' | 'destination' = isMessagesActive
    ? 'messages'
    : isSearchActive
      ? 'search'
      : isPortalinkActive
        ? 'portalink'
        : activeCategoryId !== null
          ? 'category'
          : isProfileActive
            ? 'profile'
            : isHomeActive
              ? 'home'
              : 'destination';
  function handleCategorySelect(categoryId: string) {
    onCategorySelect(categoryId);
  }
  function handleProfileOpen() {
    onProfileOpen();
  }
  if (isMobile) return <MobileNavigation onMessages={fromDock=>onMessagesOpen(undefined,fromDock)}
    onProfile={onProfileOpen} profileHref={profileHref} isProfileActive={isProfileActive} />;

  const mainDestinations = (compact: boolean) => <>
    <NavTile label="Explore" icon={SearchIcon} isActive={activeTarget === 'home'} onSelect={() => handleNavigate('Today')} compact={compact} />
    <NavTile label="Messages" icon={MessageCircleIcon} isActive={activeTarget === 'messages'} onSelect={() => onMessagesOpen()} compact={compact} ariaLabel="Open messages" />
    {isAuthenticated ? <PersonalNavigationTile destination="portalSearch" collapsed={compact} active={isPortalSearchActive} /> : <NavTile label="Portal search" icon={PortalRingIcon} isActive={false} disabled compact={compact} ariaLabel="Portals unavailable" title="Portals is not available yet" />}
    {isAuthenticated ? <PersonalNavigationTile destination="studio" collapsed={compact} active={isStudioActive} /> : <NavTile label="Studio" icon={ShapesIcon} isActive={false} disabled compact={compact} ariaLabel="Studio unavailable" title="Studio is not available yet" />}
    <NavTile label="Profile" icon={CircleUserRoundIcon} isActive={activeTarget === 'profile'} onSelect={handleProfileOpen} href={profileHref} compact={compact} ariaLabel="Open your profile" />
  </>;
  const workspaceDestinations = (compact: boolean) => <>
    <NavTile label="Saved" icon={BookmarkIcon} isActive={isSavedActive} href={buildPath('saved')} compact={compact} />
    {isAuthenticated && <><PersonalNavigationTile destination="insights" collapsed={compact} active={isInsightsActive} /><PersonalNavigationTile destination="notifications" collapsed={compact} active={isActivityActive} /></>}
  </>;
  const themeLabel = theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance';
  return <>
      <aside data-saved-change-scope="" data-resizable-panel="" data-desktop-navigation="" data-collapsed={isSidebarCollapsed ? 'true' : 'false'} style={{ width: isSidebarCollapsed ? '52px' : `${mainSidebarWidth.width}px` }} className="desktop-navigation relative h-full shrink-0" aria-label="Portalink navigation">
        <div className="desktop-navigation-rail" aria-label="Application rail">
          <button type="button" onClick={toggleCollapsed} aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!isSidebarCollapsed} data-sidebar-toggle="" data-structural-toggle="" className="desktop-navigation-brand desktop-navigation-icon" title="Portalink">
            <InterfaceIcon icon={isSidebarCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} size="sm" weight="medium" />
          </button>
          {isSidebarCollapsed && <nav className="desktop-navigation-rail-destinations scrollbar-hidden" aria-label="Compact main destinations">{mainDestinations(true)}{workspaceDestinations(true)}</nav>}
          <div className="desktop-navigation-rail-shortcuts">
            <NavTile label="World view" icon={SatelliteDishIcon} isActive={activeTarget === 'portalink'} onSelect={onPortalinkOpen} compact ariaLabel="Open Portalink world view" />
            <NavTile label="Search accounts" icon={UserSearchIcon} isActive={activeTarget === 'search'} onSelect={onSearchOpen} compact ariaLabel="Search accounts" />
            {liveShow && <button type="button" onClick={onLeaveShow} aria-label={`Leave live session: ${liveShow}`} title={`Live — ${liveShow}`} data-static-icon="" className="desktop-navigation-icon"><Disc3Icon data-keep-color="" className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--live-accent)' }} /></button>}
          </div>
          <div className="desktop-navigation-rail-footer">
            <SettingsTrigger collapsed onOpen={onControlCenterOpen} />
            <NavTile label={theme === 'dark' ? 'Light appearance' : 'Dark appearance'} icon={theme === 'dark' ? SunIcon : MoonIcon} isActive={false} onSelect={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} compact ariaLabel={themeLabel} />
            {isSidebarCollapsed && !isAuthenticated && <NavTile label="Sign in" icon={DoorOpenIcon} isActive={false} disabled={isAuthActionPending} onSelect={onSignIn} compact ariaLabel="Sign in" />}
          </div>
        </div>
        {!isSidebarCollapsed && <div data-material="navigation" className="ps-panel sidebar-surface desktop-navigation-panel">
          <header className="desktop-navigation-heading"><span className="desktop-navigation-wordmark">Portalink</span><span className="desktop-navigation-company">Networks</span></header>
          <div className="desktop-navigation-content" aria-label="Navigation and work">
            <nav className="desktop-navigation-group" aria-label="Main destinations">{mainDestinations(false)}</nav>
            <section className="desktop-navigation-group" aria-labelledby="desktop-workspace-heading"><h2 id="desktop-workspace-heading" className="desktop-navigation-section-label">Workspace</h2><nav aria-label="Workspace destinations">{workspaceDestinations(false)}</nav></section>
            {viewedProfile && <div className="flex min-h-0 flex-col">
              {/* The heading names whose portals are being browsed. Ownership is
                   resolved from the authenticated viewer upstream, so "My" can
                   never be inferred merely from whichever route is open. */}
              <SidebarSection id="portfolio-navigation" label={portalsHeading}>
                {/* Padding inside the scroll area, so a selected row's fill and
                     focus ring are never clipped by the heading above it. */}
                {/* The identity row and the section heading sit OUTSIDE the
                     scroll area, so they hold their place while the categories
                     move beneath them. Only the list below actually scrolls. */}
                <div className="sidebar-pill-group flex min-h-0 flex-1 flex-col pt-3">
                  <p id="portfolio-reorder-hint" className="sr-only">Press and hold to drag a category into a new position, or hold Alt and press the up or down arrow keys.</p>
                  {/* The section's name sits directly above the list it names,
                       on the same 12px axis as the category icons under it — and
                       it STAYS there: it sticks to the top of the scroll area so
                       the categories pass beneath it rather than scrolling the
                       label they belong to off the screen. Opaque, so rows really
                       disappear under it instead of showing through. */}
                  <div className="group/portals-heading relative my-2 flex h-7 w-full shrink-0 items-center">
                    <h2 className="ps-heading portals-heading flex h-full min-w-0 flex-1 items-center pl-2 pr-10 text-left text-[14px] font-semibold text-[var(--text-tertiary)]">
                      {portalsHeading}
                    </h2>
                    {isOwnerMode && <button type="button" onClick={() => setIsAddingPortal(true)} aria-label="Add portal" title="Add portal" aria-haspopup="dialog" className="shape-compact pointer-events-none absolute right-2 flex h-6 w-6 items-center justify-center opacity-0 text-[var(--text-tertiary)] transition-[opacity,color,background-color] duration-[var(--m-fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] group-hover/portals-heading:pointer-events-auto group-hover/portals-heading:opacity-100 group-focus-within/portals-heading:pointer-events-auto group-focus-within/portals-heading:opacity-100">
                        <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
                      </button>}
                  </div>
                  {/* The edge fade is driven by scroll POSITION, so it is only
                       present at an edge the list is actually travelling past —
                       a short list, or one resting at either end, shows none. */}
                  <nav ref={categoryScrollRef} onScroll={handleCategoryScroll} aria-label={`${viewedProfile.name} profile navigation`} className="sidebar-scroll-fade scrollbar-hidden is-at-top is-at-bottom min-h-0 flex-1 overflow-y-auto">
                  {/* The arrangement could not be read, so management is offered
                         read-only rather than letting an edit write over an order
                         nobody has actually seen. */}
                  {isOwnerMode && management.arrangementError && <div role="alert" className="mb-2 flex flex-col gap-1.5 rounded-[10px] border border-[var(--hairline-strong)] px-2.5 py-2 text-[12px] leading-relaxed">
                      <span className="flex items-center gap-1.5">
                        <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">{management.arrangementError}</span>
                      </span>
                      <button type="button" onClick={management.reloadArrangement} className="self-start font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                    </div>}
                  {/* One failure surface for every operation, naming what failed
                         and offering the same attempt again. */}
                  {isOwnerMode && <SavedChangeNotice history={management.history} />}
                  {isOwnerMode && management.failure && <div role="alert" className="mb-2 flex flex-col gap-1.5 rounded-[10px] border border-[var(--hairline-strong)] px-2.5 py-2 text-[12px] leading-relaxed">
                      <span className="flex items-center gap-1.5">
                        <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">{management.failure.message}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <button type="button" onClick={management.failure.retry} className="font-semibold text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Try again</button>
                        <button type="button" onClick={management.dismissFailure} className="text-[var(--text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Dismiss</button>
                      </span>
                    </div>}
                  {isOwnerMode ? <Reorder.Group as="ul" axis="y" values={displayedCategoryIds} onReorder={updateDraftCategoryOrder} className="m-0 list-none p-0">
                      {displayedCategories.map((category) => <DraggableCategoryRow key={category.id} category={decorateCategory(category)} isActive={activeTarget === 'category' && activeRootCategoryId === category.id} accentColor={accentColor} theme={theme} isHidden={hiddenCategoryIds.includes(category.id)} isReorderDisabled={isCategoryReorderDisabled} isRenaming={renamingCategoryId === category.id} isBusy={management.pending?.categoryId === category.id} readDeletionCapability={() => management.readDeletionCapability(category.id)} onSelect={() => handleCategorySelect(category.id)} onMoveByKeyboard={moveCategory} onReorderCommit={() => void commitDraftCategoryOrder()} onHideToggle={() => void management.toggleCategoryHidden(category.id)} onRenameStart={() => setRenamingCategoryId(category.id)} onRenameCancel={() => setRenamingCategoryId(null)} onRenameCommit={(label) => {
                        // The category page titles itself from the record, so the
                        // rename goes to the record rather than to a local label map.
                        void commitRename(category.id, label);
                      }} onChangeIcon={() => onChangeCategoryIcon(category.id)} onDelete={() => deleteCategory(category.id)} />)}
                    </Reorder.Group> : <ul className="m-0 list-none p-0">
                      {rootCategories.map((category) => <li key={category.id} className="relative list-none">
                          <CategoryRowContent category={decorateCategory(category)} isActive={activeTarget === 'category' && activeRootCategoryId === category.id} accentColor={accentColor} theme={theme} isDraggable={false} isHidden={hiddenCategoryIds.includes(category.id)} onSelect={() => handleCategorySelect(category.id)} />
                        </li>)}
                    </ul>}
                  </nav>
                </div>
              </SidebarSection>
            </div>}
          </div>
          <div className="sidebar-account-footer desktop-navigation-account-footer">
            <button type="button" className="desktop-navigation-account" disabled={isAuthActionPending} onClick={isAuthenticated ? handleProfileOpen : onSignIn} aria-label={isAuthenticated ? 'Open account profile' : 'Sign in to Portalink'}>
              <span className="desktop-navigation-avatar" aria-hidden="true">{isAuthenticated && accountAvatar ? <img src={accountAvatar} alt="" /> : <InterfaceIcon icon={CircleUserRoundIcon} size="sm" />}</span>
              <span className="desktop-navigation-account-copy"><span>{isAuthenticated ? accountName || 'Your account' : 'Portalink account'}</span><span className="desktop-navigation-account-detail">{isAuthenticated ? 'Personal workspace' : 'Sign in to continue'}</span></span>
            </button>
          </div>
        </div>}
        {!isSidebarCollapsed && <ResizablePanelHandle side="right" value={mainSidebarWidth.width} min={260} max={360} onResize={mainSidebarWidth.updateWidth} onResizeEnd={mainSidebarWidth.commitWidth} onReset={mainSidebarWidth.resetWidth} label="Resize main navigation. Double-click to restore the default width." />}
      </aside>
      {isAddingPortal && isOwnerMode && <NewCategoryDialog itemName="portal" onCancel={() => setIsAddingPortal(false)} onCreate={(label, iconName) => {
        void addCategory(label, iconName);
        setIsAddingPortal(false);
      }} />}
    </>;
}
