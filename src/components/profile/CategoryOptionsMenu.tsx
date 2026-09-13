import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeIcon, EyeOffIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, ShapesIcon, Trash2Icon } from 'lucide-react';
import type { CategoryDeletionCapability, PortfolioCategory } from '../../types/domain';
import { resolveAccentTokens } from '../../utils/accentTokens';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { usePresentation } from '../../presentation/usePresentation';

/** Shared owner menu; mobile exposes its trigger without requiring hover. */
export function CategoryOptionsMenu({ category, accentColor, theme, isHidden = false, isBusy = false, disabled = false, mobile = false, readDeletionCapability, onHideToggle, onRenameStart, onChangeIcon, onDelete }: {
  category: PortfolioCategory;
  accentColor: string;
  theme: 'light' | 'dark';
  isHidden?: boolean;
  isBusy?: boolean;
  disabled?: boolean;
  mobile?: boolean;
  readDeletionCapability?: () => Promise<CategoryDeletionCapability>;
  onHideToggle?: () => void;
  onRenameStart?: () => void;
  onChangeIcon?: () => void;
  onDelete?: () => void;
}) {
  const presentation = usePresentation();
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
      left: Math.max(8, rect.right - (mobile ? 224 : 164))
    });
  }, [isMenuOpen, isConfirmingDelete, capability, mobile]);
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
  return <div className={`${mobile ? 'mobile-portal-options flex shrink-0 items-center' : 'absolute inset-y-0 right-2 flex items-center'} transition-opacity duration-150 ease-out motion-reduce:transition-none ${mobile || isMenuOpen ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100'}`}>
          <button type="button" data-static-icon="" disabled={disabled || isBusy} aria-label={`Options for ${category.label}`} aria-haspopup="menu" aria-expanded={isMenuOpen} onClick={(event) => {
        event.stopPropagation();
        setIsMenuOpen((open) => !open);
      }} ref={triggerRef} data-row-menu="" className={`${mobile ? 'h-11 w-11' : 'h-6 w-6'} flex items-center justify-center rounded-full text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40`}>
            <InterfaceIcon icon={MoreHorizontalIcon} weight="medium" />
          </button>

          {isMenuOpen && createPortal(<div ref={menuRef} data-presentation={presentation} data-mobile-portal-menu={mobile ? '' : undefined} role="menu" aria-label={`${category.label} options`} style={{
        ...resolveAccentTokens(accentColor, theme),
        position: 'fixed',
        top: mobile ? `max(env(safe-area-inset-top, 0px), ${menuPosition.top}px)` : menuPosition.top,
        left: menuPosition.left,
        backgroundColor: 'var(--surface-raised)',
        boxShadow: '0 16px 40px rgba(30,41,59,0.24)',
        zIndex: 9999,
        ...(mobile ? {
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px)',
          overflowY: 'auto' as const
        } : {})
      }} className={`side-panel-popover theme-${theme} accent-theme ${mobile ? 'w-[224px]' : 'w-[164px]'} overflow-hidden rounded-[10px] border border-[var(--hairline)] py-1 text-[var(--text-primary)]`}>
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
                    <button type="button" onClick={() => setIsConfirmingDelete(false)} style={mobile ? { minHeight: 44 } : undefined} className="dialog-action-button h-7 flex-1 rounded-[7px] border border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {capability && !capability.isAvailable ? 'Close' : 'Cancel'}
                    </button>
                    {/* Offered only once the store has confirmed it is safe. */}
                    {(!capability || capability.isAvailable) && <button type="button" data-keep-color="" disabled={!capability || disabled || isBusy} onClick={() => {
              setIsMenuOpen(false);
              onDelete?.();
            }} style={{
              backgroundColor: 'var(--status-danger)',
              ...(mobile ? { minHeight: 44 } : {})
            }} className="dialog-action-button h-7 flex-1 rounded-[7px] text-[12px] font-semibold text-[var(--status-danger-foreground)] transition-colors hover:bg-[var(--status-danger-hover)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {isBusy ? 'Deleting…' : 'Delete'}
                    </button>}
                  </div>
                </div> : <>
              <button type="button" role="menuitem" disabled={disabled || isBusy} style={mobile ? { minHeight: 44 } : undefined} onClick={() => {
            setIsMenuOpen(false);
            onHideToggle?.();
          }} className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                {isHidden ? <InterfaceIcon icon={EyeIcon} weight="medium" /> : <InterfaceIcon icon={EyeOffIcon} weight="medium" />}
                {isHidden ? 'Make visible' : 'Hide'}
              </button>
              <button type="button" role="menuitem" disabled={disabled || isBusy} style={mobile ? { minHeight: 44 } : undefined} onClick={() => {
            setIsMenuOpen(false);
            onRenameStart?.();
          }} className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                <InterfaceIcon icon={PencilIcon} weight="medium" />
                Rename
              </button>
              <button type="button" role="menuitem" disabled={disabled || isBusy} style={mobile ? { minHeight: 44 } : undefined} onClick={() => {
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
                  <button type="button" role="menuitem" disabled={disabled || isBusy} style={mobile ? { minHeight: 44 } : undefined} onClick={() => setIsConfirmingDelete(true)} className="group/delete flex h-9 w-full items-center gap-2.5 px-3 text-left text-small font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none">
                    <Trash2Icon data-keep-color="" className="h-4 w-4 shrink-0 text-[var(--text-primary)] group-hover/delete:text-[var(--status-danger)]" aria-hidden="true" />
                    <span className="group-hover/delete:text-[var(--status-danger)]" data-keep-color="">Delete</span>
                  </button>
                </>}
                </>}
            </div>, document.body)}
        </div>;
}
