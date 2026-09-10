import { MobileNavigation } from '../presentation/mobile/MobileNavigation';
import { usePresentation } from '../presentation/usePresentation';
import { useCompactNavigation } from '../hooks/useCompactNavigation';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import type { CategoryDeletionCapability } from '../types/domain';
import { AlbumIcon, AlertCircleIcon, SatelliteDishIcon, BarChart3Icon, CheckIcon, Loader2Icon, ChevronDownIcon, ChevronRightIcon, CircleUserRoundIcon, Clock3Icon, Disc3Icon, DoorOpenIcon, Gamepad2Icon, HeartIcon, HomeIcon, LayersIcon, LayoutGridIcon, ListMusicIcon, LogInIcon, LogOutIcon, MessageCircleIcon, Music2Icon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlayIcon, PlusIcon, SearchIcon, SendIcon, SettingsIcon, SunIcon, MoonIcon, TypeIcon, UserRoundIcon, MoreHorizontalIcon, EyeIcon, EyeOffIcon, PencilIcon, ShapesIcon, Trash2Icon, WarehouseIcon } from 'lucide-react';
import { AiMarkIcon } from './AiMarkIcon';
import { PortalRingIcon } from './PortalRingIcon';
import { NewCategoryDialog } from './profile/NewCategoryDialog';
import { resolveAccentTokens } from '../utils/accentTokens';
import { InterfaceIcon } from './ui/InterfaceIcon';
import type { InterfaceIconSource } from './ui/InterfaceIcon';
import { CreatorAvatar } from './profile/CreatorAvatar';
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
  /**
   * Opens the profile currently being VIEWED, which is not always the viewer's
   * own. The portal row names that creator, so it must land on them.
   */
  onMessagesOpen: (recipientProfileId?: string) => void;
  /** The resolved appearance, so the toggle can name the one it switches to. */
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  /** Messages is its own destination, so the figure reports when it is open. */
  isMessagesActive?: boolean;
  isInsightsActive?: boolean;
  isActivityActive?: boolean;
  isSavedActive?: boolean;
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
const primaryNav: NavItem[] = [{
  label: 'Today',
  displayLabel: 'Home',
  icon: HomeIcon
}];
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
  label,
  icon: Icon,
  isActive,
  activeClassName,
  onSelect,
  href,
  ariaLabel,
  title,
  isProfileTile = false,
  disabled = false











}: {label: string;icon: InterfaceIconSource;isActive: boolean;activeClassName: string;onSelect?: () => void;href?: string;ariaLabel?: string;title?: string;isProfileTile?: boolean;disabled?: boolean;}) {
  // The destination name remains available to assistive technology and as a
  // native tooltip, while the four-button panel itself stays icon-only.
  const className = `ps-nav-item nav-button sidebar-primary-control shape-compact mx-auto flex items-center justify-center text-center transition-colors focus:outline-none ${isActive ? `${activeClassName} font-semibold` : 'font-medium'}`;
  if (href && !disabled) {
    return <Link to={href} aria-label={ariaLabel ?? label} title={title ?? ariaLabel ?? label} aria-current={isActive ? 'page' : undefined} data-profile-tile={isProfileTile ? '' : undefined} className={className}>
        <InterfaceIcon icon={Icon} weight="medium" />
      </Link>;
  }
  return <button type="button" disabled={disabled} onClick={disabled ? undefined : onSelect} aria-label={ariaLabel ?? label} title={title ?? ariaLabel ?? label} aria-current={!disabled && isActive ? 'page' : undefined} data-profile-tile={isProfileTile ? '' : undefined} className={className}>
      <InterfaceIcon icon={Icon} weight="medium" />
    </button>;
}

/** A visible Portal destination marker, reserved until its route is designed. */
function PortalNetworkTile() {
  return <button type="button" disabled aria-label="Portals unavailable" title="Portals is not available yet" className="ps-nav-item nav-button sidebar-primary-control reserved-network-control shape-compact mx-auto flex items-center justify-center focus:outline-none">
      <InterfaceIcon icon={PortalRingIcon} weight="medium" />
    </button>;
}

/** Personal utilities occupy the same slots in the expanded and collapsed rail. */
function PersonalFooterLinks({ collapsed, activityActive, insightsActive }: {collapsed: boolean;activityActive: boolean;insightsActive: boolean;}) {
  return <>{([
    ['Activity', 'notifications', BellIcon, activityActive],
    ['Insights', 'insights', BarChart3Icon, insightsActive],
  ] as const).map(([label, route, icon, active]) => <Link key={route} to={buildPath(route)} aria-label={`Open ${label}`} title={label} aria-current={active ? 'page' : undefined} className={`${collapsed ? 'sidebar-rail-slot' : 'sidebar-primary-control mx-auto'} nav-button shape-compact flex shrink-0 items-center justify-center transition-colors hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${active ? 'bg-[var(--surface-selected)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)]'}`}><InterfaceIcon icon={icon} size="sm" weight="medium" /></Link>)}</>;
}

function AccountMenuTrigger({
  collapsed,
  accentColor,
  theme,
  isAuthenticated,
  isAuthActionPending,
  accountName,
  accountAvatar,
  profileHref,
  onProfileOpen,
  onSettingsOpen,
  onSignIn,
  onSignOut
}: {
  collapsed: boolean;
  accentColor: string;
  theme: 'light' | 'dark';
  isAuthenticated: boolean;
  isAuthActionPending: boolean;
  accountName?: string;
  accountAvatar?: string | null;
  profileHref?: string;
  onProfileOpen: () => void;
  onSettingsOpen: () => void;
  onSignIn: () => void;
  onSignOut: () => Promise<boolean>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied'>('idle');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setInviteStatus('idle');
  }, []);

  const positionMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const menuWidth = Math.min(326, window.innerWidth - 16);
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    setPosition({
      top: Math.max(8, rect.top - menuHeight - 10),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      positionMenu();
    }
  }, [isOpen, positionMenu]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        closeMenu();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', positionMenu);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', positionMenu);
    };
  }, [closeMenu, isOpen, positionMenu]);

  async function inviteFriend() {
    // Invites use the public viewer route, so a recipient never lands inside the
    // sender's account workspace. The public page already offers its own Join
    // the Portalink Network path for anyone who wants an account.
    const publicProfileHref = profileHref?.replace(/^\/p\//, '/share/');
    const inviteUrl = publicProfileHref ? new URL(publicProfileHref, window.location.origin).toString() : window.location.origin;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Portalink Networks',
          text: 'Join me on the Portalink Network.',
          url: inviteUrl
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteStatus('copied');
    } catch {
      // A blocked clipboard write does not claim success.
    }
  }

  async function handleAuthAction() {
    if (!isAuthenticated) {
      closeMenu();
      onSignIn();
      return;
    }
    setIsSigningOut(true);
    const signedOut = await onSignOut();
    setIsSigningOut(false);
    if (signedOut) {
      closeMenu();
    }
  }

  const shownName = isAuthenticated ? accountName?.trim() || 'Portalink member' : 'Welcome to Portalink';
  const triggerClassName = collapsed
    ? 'nav-button sidebar-rail-slot shape-compact flex items-center justify-center transition-colors focus:outline-none'
    : 'nav-button sidebar-primary-control shape-compact mx-auto flex shrink-0 items-center justify-center transition-colors focus:outline-none';

  return <>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen((open) => !open)} aria-label="Open account and settings menu" aria-haspopup="menu" aria-expanded={isOpen} className={triggerClassName}>
        <InterfaceIcon icon={SettingsIcon} size="sm" weight="medium" />
      </button>
      {isOpen && createPortal(<div ref={menuRef} role="menu" aria-label="Account and settings" style={{
        ...resolveAccentTokens(accentColor, theme),
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 10000
      }} className={`account-menu-popover theme-${theme} accent-theme w-[min(326px,calc(100vw-16px))] overflow-hidden rounded-[22px] p-3 text-[var(--text-primary)]`}>
          {isAuthenticated && profileHref ? <Link to={profileHref} role="menuitem" onClick={closeMenu} className="account-menu-identity flex h-10 w-full items-center gap-2.5 rounded-[12px] px-1.5 text-left font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <CreatorAvatar name={shownName} avatar={accountAvatar} shape="compact" className="h-7 w-7 shrink-0 text-[10px]" />
              <span className="min-w-0 flex-1 truncate text-[15px]">{shownName}</span>
            </Link> : <button type="button" role="menuitem" onClick={() => {
          closeMenu();
          isAuthenticated ? onProfileOpen() : onSignIn();
        }} className="account-menu-identity flex h-10 w-full items-center gap-2.5 rounded-[12px] px-1.5 text-left font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {isAuthenticated ? <CreatorAvatar name={shownName} avatar={accountAvatar} shape="compact" className="h-7 w-7 shrink-0 text-[10px]" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--surface-sunken)] text-[var(--text-secondary)]"><CircleUserRoundIcon className="h-4 w-4" aria-hidden="true" /></span>}
              <span className="min-w-0 flex-1 truncate text-[15px]">{shownName}</span>
            </button>}
          <span role="separator" className="mx-1 my-2 block h-px bg-[var(--hairline)]" />
          <button type="button" role="menuitem" onClick={() => void inviteFriend()} className="account-menu-row flex h-9 w-full items-center gap-2.5 rounded-[10px] px-1.5 text-left text-[14px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={SendIcon} weight="medium" />
            <span className="min-w-0 flex-1">{inviteStatus === 'copied' ? 'Invite link copied' : 'Invite a friend'}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => {
        closeMenu();
        onSettingsOpen();
      }} className="account-menu-row flex h-9 w-full items-center gap-2.5 rounded-[10px] px-1.5 text-left text-[14px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={SettingsIcon} weight="medium" />
            <span className="min-w-0 flex-1">Settings</span>
          </button>
          <button type="button" role="menuitem" disabled={isAuthActionPending || isSigningOut} onClick={() => void handleAuthAction()} className="account-menu-row flex h-9 w-full items-center gap-2.5 rounded-[10px] px-1.5 text-left text-[14px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={isAuthenticated ? LogOutIcon : LogInIcon} weight="medium" />
            <span className="min-w-0 flex-1">{isAuthenticated ? isSigningOut || isAuthActionPending ? 'Logging out…' : 'Log out' : 'Log in'}</span>
          </button>
          <span className="sr-only" aria-live="polite">{inviteStatus === 'copied' ? 'Invite link copied.' : ''}</span>
        </div>, document.body)}
    </>;
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


























}: {category: ProfileCategory;isActive: boolean;accentColor: string;theme: 'light' | 'dark';isDraggable: boolean;isHidden?: boolean;isRenaming?: boolean; /** An operation on THIS row is in flight, so its controls stand down. */isBusy?: boolean;showOptions?: boolean; /** Asked when the confirmation opens, so the answer comes from the store. */readDeletionCapability?: () => Promise<CategoryDeletionCapability>;onSelect: () => void;onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;onDragHandlePointerDown?: (event: React.PointerEvent) => void;onHideToggle?: () => void;onRenameStart?: () => void;onRenameCommit?: (label: string) => void;onRenameCancel?: () => void;onChangeIcon?: () => void; /** Removes the category from the portfolio. Owner-only, destructive. */onDelete?: () => void;}) {
  const Icon = getCategoryIcon(category.iconName);
  // What deleting this category actually does, answered by the service rather
  // than assumed here: null while it is still being asked.
  const [capability, setCapability] = useState<CategoryDeletionCapability | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0
  });
  // Deleting is destructive and unrecoverable, so it confirms in place.
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!isMenuOpen) {
      setIsConfirmingDelete(false);
      setCapability(null);
    }
  }, [isMenuOpen]);
  // Read when the confirmation opens, so the panel can state the consequences
  // truthfully — or refuse, when work would be lost.
  useEffect(() => {
    if (!isConfirmingDelete || !readDeletionCapability) {
      return;
    }
    let isCurrent = true;
    setCapability(null);
    readDeletionCapability().then((next) => {
      if (isCurrent) {
        setCapability(next);
      }
    }).catch(() => {
      if (isCurrent) {
        setCapability({
          isAvailable: false,
          removes: [],
          reason: 'Whether this can be deleted could not be checked. Nothing was removed.',
          blockingProjectCount: 0
        });
      }
    });
    return () => {
      isCurrent = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-ask only when the panel opens.
  }, [isConfirmingDelete]);
  // Rows near the bottom of the sidebar flip the menu above the trigger, so the
  // lower categories' options are never clipped by the viewport. Measured
  // before paint so the menu never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const opensUpward = menuHeight > 0 && spaceBelow < menuHeight && rect.top > menuHeight;
    const top = opensUpward ? rect.top - 6 - menuHeight : Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 8 - menuHeight));
    setMenuPosition({
      top: Math.max(8, top),
      left: Math.max(8, rect.right - 164)
    });
  }, [isMenuOpen, isConfirmingDelete]);
  const [draftLabel, setDraftLabel] = useState(category.label);
  useEffect(() => {
    setDraftLabel(category.label);
  }, [category.label]);
  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }
    function closeOnOutsideTap(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setIsMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideTap);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideTap);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);
  return <div className={`side-panel-row group/row relative mb-[var(--side-panel-row-gap)] w-full ${isHidden ? 'opacity-50' : ''}`}>
      {/* A category is a destination inside the active product area, so its
         selected state is a quieter version of the primary nav's accent. */}
      <button type="button" data-category-row="" onClick={onSelect} onKeyDown={onKeyDown} aria-current={isActive ? 'page' : undefined} aria-describedby={isDraggable ? 'portfolio-reorder-hint' : undefined} className={`ps-list-btn sidebar-pill-row flex h-full w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[180ms] ease-out focus:outline-none ${isActive ? 'bg-[var(--surface-selected)] font-semibold text-[var(--accent-text)]' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]'}`}>
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
      {showOptions && <div className={`absolute inset-y-0 right-2 flex items-center transition-opacity duration-150 ease-out motion-reduce:transition-none ${isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100'}`}>
          <button type="button" data-static-icon="" aria-label={`Options for ${category.label}`} aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={(event) => {
        event.stopPropagation();
        setIsMenuOpen((open) => !open);
      }} ref={triggerRef} data-row-menu="" className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={MoreHorizontalIcon} weight="medium" />
          </button>

          {isMenuOpen && createPortal(<div ref={menuRef} role="menu" aria-label={`${category.label} options`} style={{
        ...resolveAccentTokens(accentColor, theme),
        position: 'fixed',
        top: menuPosition.top,
        left: menuPosition.left,
        backgroundColor: 'var(--surface-raised)',
        boxShadow: '0 16px 40px rgba(30,41,59,0.24)',
        zIndex: 9999
      }} className={`side-panel-popover theme-${theme} accent-theme w-[164px] overflow-hidden rounded-[10px] border border-[var(--hairline)] py-1 text-[var(--text-primary)]`}>
              {isConfirmingDelete ? <div className="px-3 py-2">
                  <p className="m-0 text-[12px] font-semibold leading-snug text-[var(--text-primary)]">Delete “{category.label}”?</p>
                  {/* Consequences come from the service, so this never promises an
               outcome the store would not actually perform. */}
                  {!capability ? <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
                      <Loader2Icon className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                      Checking what this removes…
                    </p> : capability.isAvailable ? <ul className="m-0 mt-1 list-none space-y-0.5 p-0 text-[11px] leading-snug text-[var(--text-secondary)]">
                      {capability.removes.map((line) => <li key={line}>{line}</li>)}
                    </ul> : <p role="alert" className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">{capability.reason}</p>}
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <button type="button" onClick={() => setIsConfirmingDelete(false)} className="dialog-action-button h-7 flex-1 rounded-[7px] border border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {capability && !capability.isAvailable ? 'Close' : 'Cancel'}
                    </button>
                    {/* Offered only once the store has confirmed it is safe. */}
                    {(!capability || capability.isAvailable) && <button type="button" data-keep-color="" disabled={!capability || isBusy} onClick={() => {
              setIsMenuOpen(false);
              onDelete?.();
            }} style={{
              backgroundColor: 'var(--status-danger)'
            }} className="dialog-action-button h-7 flex-1 rounded-[7px] text-[12px] font-semibold text-[var(--status-danger-foreground)] transition-colors hover:bg-[var(--status-danger-hover)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {isBusy ? 'Deleting…' : 'Delete'}
                    </button>}
                  </div>
                </div> : <>
              <button type="button" role="menuitem" onClick={() => {
            setIsMenuOpen(false);
            onHideToggle?.();
          }} className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                {isHidden ? <InterfaceIcon icon={EyeIcon} weight="medium" /> : <InterfaceIcon icon={EyeOffIcon} weight="medium" />}
                {isHidden ? 'Make visible' : 'Hide'}
              </button>
              <button type="button" role="menuitem" onClick={() => {
            setIsMenuOpen(false);
            onRenameStart?.();
          }} className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                <InterfaceIcon icon={PencilIcon} weight="medium" />
                Rename
              </button>
              <button type="button" role="menuitem" onClick={() => {
            setIsMenuOpen(false);
            onChangeIcon?.();
          }} className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                <InterfaceIcon icon={ShapesIcon} weight="medium" />
                Change icon
              </button>
              {onDelete && <>
                  <span role="separator" className="my-1 block h-px bg-[var(--hairline)]" />
                  {/* Destructive, so it rests neutral and only reads as danger
                 once it is the thing being pointed at. */}
                  <button type="button" role="menuitem" onClick={() => setIsConfirmingDelete(true)} className="group/delete flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                    <Trash2Icon data-keep-color="" className="h-4 w-4 shrink-0 text-[var(--text-primary)] group-hover/delete:text-[var(--status-danger)]" aria-hidden="true" />
                    <span className="group-hover/delete:text-[var(--status-danger)]" data-keep-color="">Delete</span>
                  </button>
                </>}
                </>}
            </div>, document.body)}
        </div>}
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
    duration: shouldReduceMotion ? 0 : 0.18,
    ease: [0.22, 1, 0.36, 1]
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
  isPortalinkActive,
  accentColor,
  onControlCenterOpen,
  isAuthenticated,
  isAuthActionPending,
  accountName,
  accountAvatar,
  onSignIn,
  onSignOut,
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
    minWidth: 184,
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
      return;
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
  const [draftCategoryIds, setDraftCategoryIds] = useState<string[] | null>(null);
  const draftCategoryIdsRef = useRef<string[] | null>(null);

  // Dragging is presentation-only until the pointer is released. Framer emits
  // many reorder frames during one gesture; saving each frame races Supabase and
  // can leave an earlier intermediate order as the durable one.
  useEffect(() => {
    setDraftCategoryIds((current) => {
      const known = new Set(arrangedCategoryIds);
      const retained = (current ?? []).filter((id) => known.has(id));
      const merged = [...retained, ...arrangedCategoryIds.filter((id) => !retained.includes(id))];
      draftCategoryIdsRef.current = merged;
      return merged;
    });
  }, [arrangedCategoryIds]);

  const displayedCategories = useMemo(() => {
    if (!draftCategoryIds) {
      return arrangedCategories;
    }
    const byId = new Map(arrangedCategories.map((category) => [category.id, category]));
    return draftCategoryIds.map((id) => byId.get(id)).filter((category): category is ProfileCategory => Boolean(category));
  }, [arrangedCategories, draftCategoryIds]);
  const displayedCategoryIds = useMemo(() => displayedCategories.map((category) => category.id), [displayedCategories]);
  const isCategoryReorderDisabled = management.isLoadingArrangement || !management.arrangement || management.pending !== null;

  function updateDraftCategoryOrder(nextIds: string[]) {
    draftCategoryIdsRef.current = nextIds;
    setDraftCategoryIds(nextIds);
  }

  async function commitDraftCategoryOrder(nextIds = draftCategoryIdsRef.current) {
    if (!nextIds || isCategoryReorderDisabled) {
      return;
    }
    const previousIds = arrangedCategoryIds;
    const saved = await management.reorderCategories(nextIds);
    if (!saved) {
      draftCategoryIdsRef.current = previousIds;
      setDraftCategoryIds(previousIds);
    }
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
  /* One system panel control in both states, matching the project and engagement
     sidebars instead of giving the main sidebar a separate globe metaphor. */
  const sidebarToggle = <button type="button" onClick={toggleCollapsed} aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!isSidebarCollapsed} data-sidebar-toggle="" data-structural-toggle="" className={`shape-compact flex shrink-0 items-center justify-center text-[var(--text-secondary)] transition-colors duration-150 ease-out hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSidebarCollapsed ? 'sidebar-rail-slot' : 'side-panel-header-control side-panel-header-icon'}`}>
      {isSidebarCollapsed ? <PanelLeftOpenIcon className="h-[18px] w-[18px]" aria-hidden="true" /> : <PanelLeftCloseIcon className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>;
  if (isMobile) return <MobileNavigation
    theme={theme} onThemeChange={onThemeChange} onPortalink={onPortalinkOpen} onMessages={onMessagesOpen}
    onProfile={onProfileOpen} profileHref={profileHref} isProfileActive={isProfileActive}
    settings={<AccountMenuTrigger collapsed accentColor={accentColor} theme={theme} isAuthenticated={isAuthenticated} isAuthActionPending={isAuthActionPending} accountName={accountName} accountAvatar={accountAvatar} profileHref={profileHref} onProfileOpen={onProfileOpen} onSettingsOpen={onControlCenterOpen} onSignIn={onSignIn} onSignOut={onSignOut} />}
    liveControl={liveShow ? <button type="button" className="mobile-nav-destination nav-button shape-compact" onClick={onLeaveShow} aria-label={`Leave live session: ${liveShow}`}><InterfaceIcon icon={Disc3Icon} /></button> : undefined}
  />;
  return <>
      {/* Collapsed, the rail is the whole width: the aside's own side padding was
         insetting the surface by 10px on each side while the divider sat inside
         it, so the region the eye reads as the sidebar ended before the marks'
         centre line and every glyph looked pushed right. With that padding gone
         the surface spans the full rail and its centre is the sidebar's. Each
         responsive width now follows Apple Notes-style three-pane proportions,
         leaving room for full labels while keeping the content dominant. */}
      <aside data-resizable-panel="" style={isSidebarCollapsed ? undefined : { width: `${mainSidebarWidth.width}px` }} className={`sidebar-starfield relative h-full shrink-0 transition-[width] duration-150 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${isSidebarCollapsed ? 'w-[48px] py-0 sm:w-[52px]' : 'p-0'}`} aria-label="Portalink navigation">
        {/* Flat application region: one hairline divider, no floating card.
           It sits above the starfield layers behind it. */}
        {/* Collapsed, the surface carries no side padding: a 40px rail tile does
           not fit inside a padded 52px column, and the overflow was pushing every
           mark off the rail's axis. With the padding gone the tile centres in the
           column, which is the sidebar's own centre. */}
        <div data-material="navigation" className={`ps-panel sidebar-surface relative z-10 flex h-full min-h-0 flex-col overflow-hidden border-r pb-2 ${isSidebarCollapsed ? 'px-0' : 'side-panel-content-inset'}`}>
          {/* Collapsed, the rail owns the rhythm: brand, then destinations, all
             on one axis with one gap. Expanded, this is the header row. */}
          <div className={`global-control-header shrink-0 ${isSidebarCollapsed ? 'sidebar-rail sidebar-rail-brand justify-center' : 'justify-between gap-1.5'}`}>
            {isSidebarCollapsed && sidebarToggle}
            {!isSidebarCollapsed && <span className="cdx-dense-label min-w-0 flex-1 px-1 text-[12px] font-semibold text-[var(--text-primary)]">Portalink Networks</span>}
            {!isSidebarCollapsed && <div className="side-panel-control-row ml-auto min-w-0 shrink">
              {/* A spinning record marks the live session the viewer has joined. */}
              {liveShow && <button type="button" onClick={onLeaveShow} aria-label={`Leave live session: ${liveShow}`} title={`Live — ${liveShow}`} data-static-icon="" className="side-panel-header-control side-panel-header-icon shape-compact flex shrink-0 items-center justify-center focus:outline-none">
                  <Disc3Icon data-keep-color="" className="h-4 w-4" aria-hidden="true" style={{
                color: 'var(--live-accent)'
              }} />
                </button>}
            </div>}
            {/* Last in the row, matching the project sidebar's panel-close control. */}
            {!isSidebarCollapsed && sidebarToggle}
          </div>

          {/* The live indicator joins the same rail so it inherits the rhythm
             instead of carrying its own margin. */}
          {liveShow && isSidebarCollapsed && <div className="sidebar-rail shrink-0">
              <button type="button" onClick={onLeaveShow} aria-label={`Leave live session: ${liveShow}`} title={`Live — ${liveShow}`} data-static-icon="" className="sidebar-rail-slot shape-compact focus:outline-none">
                <Disc3Icon data-keep-color="" className="h-4 w-4" aria-hidden="true" style={{
              color: 'var(--live-accent)'
            }} />
              </button>
            </div>}

          {isSidebarCollapsed ? <>
              {/* One stacked group on one axis: identical squares, one shared
               gap, no per-item margins or padding. */}
              <nav className="scrollbar-hidden sidebar-rail sidebar-group min-h-0 flex-1 overflow-y-auto" aria-label="Compact main destinations">
                <button type="button" disabled aria-label="Portals unavailable" title="Portals is not available yet" className="nav-button reserved-network-control shape-compact sidebar-rail-slot focus:outline-none">
                  <InterfaceIcon icon={PortalRingIcon} weight="medium" />
                </button>
                <Link to={buildPath('saved')} aria-label="Open Saved" title="Saved" aria-current={isSavedActive ? 'page' : undefined} className="nav-button shape-compact sidebar-rail-slot flex items-center justify-center transition-colors focus:outline-none">
                  <InterfaceIcon icon={BookmarkIcon} weight="medium" />
                </Link>
                <button type="button" onClick={onPortalinkOpen} aria-label="Open Portalink world view" aria-current={activeTarget === 'portalink' ? 'page' : undefined} className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none">
                  <InterfaceIcon icon={SatelliteDishIcon} weight="medium" />
                </button>
                {primaryNav.map((item) => {
              const Icon = item.icon;
              return <button key={item.label} type="button" onClick={() => handleNavigate(item.label)} aria-label={`Open ${item.displayLabel}`} title={item.displayLabel} aria-current={activeTarget === 'home' ? 'page' : undefined} className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none"><InterfaceIcon icon={Icon} weight="medium" /></button>;
            })}
                <button type="button" disabled aria-label="Studio unavailable" title="Studio is not available yet" className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none">
                  <InterfaceIcon icon={WarehouseIcon} weight="medium" />
                </button>
                <button type="button" disabled aria-label="Search unavailable" title="Search is not available yet" className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none">
                  <InterfaceIcon icon={SearchIcon} weight="medium" />
                </button>
                <button type="button" onClick={() => onMessagesOpen()} aria-label="Open messages" aria-current={activeTarget === 'messages' ? 'page' : undefined} className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none" data-profile-tile="">
                  <InterfaceIcon icon={MessageCircleIcon} weight="medium" />
                </button>
                {profileHref ? <Link to={profileHref} aria-label="Open your profile" title="Profile" aria-current={activeTarget === 'profile' ? 'page' : undefined} data-profile-tile="" className="nav-button shape-compact sidebar-rail-slot flex items-center justify-center transition-colors focus:outline-none">
                    <InterfaceIcon icon={CircleUserRoundIcon} weight="medium" />
                  </Link> : <button type="button" onClick={handleProfileOpen} aria-label="Open your profile" title="Profile" aria-current={activeTarget === 'profile' ? 'page' : undefined} data-profile-tile="" className="nav-button shape-compact sidebar-rail-slot transition-colors focus:outline-none">
                    <InterfaceIcon icon={CircleUserRoundIcon} weight="medium" />
                  </button>}
              </nav>
            </> : <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Navigation and work">
            <nav className="ps-nav-grid side-panel-control-stack shrink-0" aria-label="Main destinations">
              <div className="sidebar-network-grid w-full">
                <div role="group" aria-label="Main navigation row one" className="contents">
                  <PortalNetworkTile />
                  <NavTile label="Saved" icon={BookmarkIcon} isActive={isSavedActive} activeClassName="" ariaLabel="Open Saved" title="Saved" href={buildPath('saved')} />
                  <NavTile label="Portalink connection" icon={SatelliteDishIcon} isActive={activeTarget === 'portalink'} activeClassName="" onSelect={onPortalinkOpen} ariaLabel="Open Portalink world view" />
                  {primaryNav.map((item) => <NavTile key={item.label} label={item.displayLabel} icon={item.icon} isActive={activeTarget === 'home'} activeClassName="" onSelect={() => handleNavigate(item.label)} ariaLabel={`Open ${item.displayLabel}`} />)}
                </div>
                <div role="group" aria-label="Main navigation row two" className="contents">
                  <NavTile label="Studio" icon={WarehouseIcon} isActive={false} activeClassName="" ariaLabel="Studio unavailable" title="Studio is not available yet" disabled />
                  <NavTile label="Search" icon={SearchIcon} isActive={false} activeClassName="" ariaLabel="Search unavailable" title="Search is not available yet" disabled />
                  <NavTile label="Messages" icon={MessageCircleIcon} isActive={activeTarget === 'messages'} activeClassName="" onSelect={() => onMessagesOpen()} ariaLabel="Open messages" isProfileTile />
                  <NavTile label="Profile" icon={CircleUserRoundIcon} isActive={activeTarget === 'profile'} activeClassName="" onSelect={handleProfileOpen} href={profileHref} ariaLabel="Open your profile" isProfileTile />
                </div>
              </div>
            </nav>

            {/* Major separation: primary navigation → portfolio context. The
                 section label needs air on both sides to read as a section
                 rather than as another navigation item. */}
            {/* No confirmed profile means no portfolio: the section is absent
                 rather than carrying a heading with nothing truthful behind it. */}
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
                    {isOwnerMode && <button type="button" onClick={() => setIsAddingPortal(true)} aria-label="Add portal" title="Add portal" aria-haspopup="dialog" className="shape-compact pointer-events-none absolute right-2 flex h-6 w-6 items-center justify-center opacity-0 text-[var(--text-tertiary)] transition-[opacity,color,background-color] duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] group-hover/portals-heading:pointer-events-auto group-hover/portals-heading:opacity-100 group-focus-within/portals-heading:pointer-events-auto group-focus-within/portals-heading:opacity-100">
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
                      {displayedCategories.map((category) => <DraggableCategoryRow key={category.id} category={decorateCategory(category)} isActive={activeTarget === 'category' && activeCategoryId === category.id} accentColor={accentColor} theme={theme} isHidden={hiddenCategoryIds.includes(category.id)} isReorderDisabled={isCategoryReorderDisabled} isRenaming={renamingCategoryId === category.id} isBusy={management.pending?.categoryId === category.id} readDeletionCapability={() => management.readDeletionCapability(category.id)} onSelect={() => handleCategorySelect(category.id)} onMoveByKeyboard={moveCategory} onReorderCommit={() => void commitDraftCategoryOrder()} onHideToggle={() => void management.toggleCategoryHidden(category.id)} onRenameStart={() => setRenamingCategoryId(category.id)} onRenameCancel={() => setRenamingCategoryId(null)} onRenameCommit={(label) => {
                        // The category page titles itself from the record, so the
                        // rename goes to the record rather than to a local label map.
                        void commitRename(category.id, label);
                      }} onChangeIcon={() => onChangeCategoryIcon(category.id)} onDelete={() => void deleteCategory(category.id)} />)}
                    </Reorder.Group> : <ul className="m-0 list-none p-0">
                      {arrangedCategories.map((category) => <li key={category.id} className="relative list-none">
                          <CategoryRowContent category={decorateCategory(category)} isActive={activeTarget === 'category' && activeCategoryId === category.id} accentColor={accentColor} theme={theme} isDraggable={false} isHidden={hiddenCategoryIds.includes(category.id)} onSelect={() => handleCategorySelect(category.id)} />
                        </li>)}
                    </ul>}
                  </nav>
                </div>
              </SidebarSection>
            </div>}
          </div>

          </>}

          {/* Settings leads the footer row, followed by Activity, Insights,
              and Appearance. The same order is preserved in the collapsed rail. */}
          <div className={`sidebar-account-footer mt-auto shrink-0 border-t border-[var(--hairline)] ${isSidebarCollapsed ? 'sidebar-rail' : 'pt-2'}`}>
            {isSidebarCollapsed ? <>
              <AccountMenuTrigger collapsed accentColor={accentColor} theme={theme} isAuthenticated={isAuthenticated} isAuthActionPending={isAuthActionPending} accountName={accountName} accountAvatar={accountAvatar} profileHref={profileHref} onProfileOpen={onProfileOpen} onSettingsOpen={onControlCenterOpen} onSignIn={onSignIn} onSignOut={onSignOut} />
              {isAuthenticated && <PersonalFooterLinks collapsed activityActive={isActivityActive} insightsActive={isInsightsActive} />}
              <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Light appearance' : 'Dark appearance'} data-system-color="" className="nav-button sidebar-rail-slot shape-compact flex items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                {theme === 'dark' ? <InterfaceIcon icon={SunIcon} size="sm" weight="medium" /> : <InterfaceIcon icon={MoonIcon} size="sm" weight="medium" />}
              </button>
            </> : <div className="sidebar-network-grid h-12 w-full min-w-0 items-center">
                <AccountMenuTrigger collapsed={false} accentColor={accentColor} theme={theme} isAuthenticated={isAuthenticated} isAuthActionPending={isAuthActionPending} accountName={accountName} accountAvatar={accountAvatar} profileHref={profileHref} onProfileOpen={onProfileOpen} onSettingsOpen={onControlCenterOpen} onSignIn={onSignIn} onSignOut={onSignOut} />
                {isAuthenticated && <PersonalFooterLinks collapsed={false} activityActive={isActivityActive} insightsActive={isInsightsActive} />}
                <button type="button" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Light appearance' : 'Dark appearance'} data-system-color="" className="nav-button sidebar-primary-control shape-compact mx-auto flex shrink-0 items-center justify-center bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                  {theme === 'dark' ? <InterfaceIcon icon={SunIcon} size="sm" weight="medium" /> : <InterfaceIcon icon={MoonIcon} size="sm" weight="medium" />}
                </button>
              </div>}
          </div>
        </div>
        {!isSidebarCollapsed && <ResizablePanelHandle side="right" value={mainSidebarWidth.width} min={184} max={360} onResize={mainSidebarWidth.updateWidth} onResizeEnd={mainSidebarWidth.commitWidth} onReset={mainSidebarWidth.resetWidth} label="Resize main navigation. Double-click to restore the default width." />}
      </aside>
      {isAddingPortal && isOwnerMode && <NewCategoryDialog itemName="portal" onCancel={() => setIsAddingPortal(false)} onCreate={(label, iconName) => {
        void addCategory(label, iconName);
        setIsAddingPortal(false);
      }} />}
    </>;
}
