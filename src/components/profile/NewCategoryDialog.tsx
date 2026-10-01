import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import React, { useEffect, useRef, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { getCategoryIcon } from './categoryIcons';
import { PortalIconLibrary } from './PortalIconLibrary';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
type NewCategoryDialogProps = {
  onCancel: () => void;
  onCreate: (label: string, iconName: string) => void;
  /** Lets portal-facing entry points use product language without duplicating the dialog. */
  itemName?: 'category' | 'portal';
  isSaving?: boolean;
  error?: string | null;
};
const DEFAULT_ICON = 'shapes';

/**
 * Naming a new Portalink category and choosing its mark, before anything is
 * created.
 *
 * A centred dialog rather than a popover: the choice has two parts now — a name
 * and an icon — and the icon set needs room to be scanned. Nothing is written
 * until Done, so an abandoned attempt leaves no half-made category behind.
 *
 * Note on colour: the reference for this screen carries a colour row, but the
 * canonical `PortfolioCategory` records a label, an icon, a format, and a blurb —
 * no colour. A swatch row here would be a control whose choice is discarded on
 * save, so it is omitted rather than faked. If per-category colour is wanted, it
 * needs a field on the category record first.
 */
export function NewCategoryDialog({
  onCancel: cancel,
  onCreate,
  itemName = 'category',
  isSaving = false,
  error = null
}: NewCategoryDialogProps) {
  const presentation = usePresentation();
  const focusTitleOnOpen = useRef(presentation === 'web');
  const [label, setLabel] = useState('');
  const [iconName, setIconName] = useState(DEFAULT_ICON);
  const [isIconSearch, setIsIconSearch] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const onCancel = () => { if (!isSaving) cancel(); };
  const onEscape = () => { if (isIconSearch) returnToTitle(); else onCancel(); };
  useModalFocus(true, dialogRef, onEscape);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Mobile keeps focus on the dialog until the user chooses to type.
    if (focusTitleOnOpen.current) fieldRef.current?.focus();
  }, []);
  const PreviewIcon = getCategoryIcon(iconName);
  const trimmed = label.trim();

  function returnToTitle() {
    setIsIconSearch(false);
    setIconQuery('');
    // Restore a noneditable control, so choosing an icon closes the keyboard.
    searchToggleRef.current?.focus({ preventScroll: true });
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }

  function toggleIconSearch() {
    if (isIconSearch) returnToTitle();
    else {
      setIsIconSearch(true);
      // Directly inside the user's gesture; opening the popup never does this.
      fieldRef.current?.focus({ preventScroll: true });
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (isIconSearch || !trimmed || isSaving) {
      return;
    }
    onCreate(trimmed, iconName);
  }
  return <ModalPortal><div role="presentation" onMouseDown={(event) => {
    // A press on the backdrop leaves; a press inside must not.
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }} className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form ref={dialogRef} tabIndex={-1} onSubmit={submit} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    }} role="dialog" aria-modal="true" aria-labelledby="new-category-heading" className="flex max-h-[min(680px,90vh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[16px] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
        <div className="relative flex shrink-0 items-center justify-center px-4 pb-2 pt-4">
          <button type="button" disabled={isSaving} onClick={onCancel} aria-label="Close" data-ui-control="icon" data-control-size="sm" data-control-variant="ghost" className="absolute left-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
          </button>
          <h2 id="new-category-heading" className="text-medium font-semibold text-[var(--text-primary)]">New {itemName}</h2>
        </div>

        <div ref={contentRef} data-portal-icon-scroll="" className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {/* The choice, shown as the thing being made: the selected mark at the
             size it will be recognised at. */}
          <div className="flex justify-center pt-4">
            <span aria-hidden="true" className="shape-squircle flex h-[88px] w-[88px] items-center justify-center bg-[var(--accent-primary)] text-[var(--accent-foreground)]">
              <PreviewIcon className="h-10 w-10" />
            </span>
          </div>

          <label htmlFor="new-category-title" className="sr-only">{isIconSearch ? 'Search icons' : `${itemName === 'portal' ? 'Portal' : 'Category'} title`}</label>
          <div className="mt-5 flex items-center gap-2">
            <input ref={fieldRef} disabled={isSaving} id="new-category-title" type={isIconSearch ? 'search' : 'text'}
              value={isIconSearch ? iconQuery : label} onChange={event => isIconSearch ? setIconQuery(event.target.value) : setLabel(event.target.value)}
              onKeyDown={event => { if (isIconSearch && event.key === 'Enter') event.preventDefault(); }}
              maxLength={isIconSearch ? undefined : 48} autoComplete="off"
              placeholder={isIconSearch ? 'Search icons' : `${itemName === 'portal' ? 'Portal' : 'Category'} title`}
              className="text-control h-11 min-w-0 flex-1 px-3 text-center text-base font-medium text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)]" />
            <button ref={searchToggleRef} type="button" disabled={isSaving} onClick={toggleIconSearch}
              aria-label={isIconSearch ? `Return to ${itemName} title` : 'Search icons'} aria-pressed={isIconSearch}
              data-ui-control="icon" data-control-size="lg" data-control-variant="secondary" className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={isIconSearch ? XIcon : SearchIcon} size="lg" />
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-[13px] text-[var(--text-primary)]">{error}</p>}

          <PortalIconLibrary selected={iconName} onSelect={name => { setIconName(name); if (isIconSearch) returnToTitle(); }} searchQuery={isIconSearch ? iconQuery : ''} disabled={isSaving} compact label={`${itemName === 'portal' ? 'Portal' : 'Category'} icon`} />
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--hairline)] px-6 py-4">
          <button type="button" disabled={isSaving} onClick={onCancel} data-ui-control="button" data-control-size="md" data-control-variant="secondary" className="flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            Cancel
          </button>
          {/* Disabled until there is a name, because a category with no title is
             not a thing that can be created. */}
          <button type="submit" disabled={isIconSearch || !trimmed || isSaving} data-ui-control="button" data-control-size="md" data-control-variant="primary" className="flex-1 bg-[var(--accent-primary)] text-[var(--accent-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {isSaving ? 'Creating…' : `Create ${itemName}`}
          </button>
        </div>
      </form>
    </div></ModalPortal>;
}
