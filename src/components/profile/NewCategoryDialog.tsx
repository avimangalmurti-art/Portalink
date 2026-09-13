import { useModalFocus } from '../../hooks/useModalFocus';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import React, { useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { categoryIconNames, getCategoryIcon } from './categoryIcons';
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
  const [label, setLabel] = useState('');
  const [iconName, setIconName] = useState(DEFAULT_ICON);
  const dialogRef = useRef<HTMLFormElement>(null);
  const onCancel = () => { if (!isSaving) cancel(); };
  useModalFocus(true, dialogRef, onCancel);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);
  const PreviewIcon = getCategoryIcon(iconName);
  const trimmed = label.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || isSaving) {
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
        onCancel();
      }
    }} role="dialog" aria-modal="true" aria-labelledby="new-category-heading" className="flex max-h-[min(680px,90vh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[16px] bg-[var(--surface-raised)] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
        <div className="relative flex shrink-0 items-center justify-center px-4 pb-2 pt-4">
          <button type="button" disabled={isSaving} onClick={onCancel} aria-label="Close" className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
          </button>
          <h2 id="new-category-heading" className="text-medium font-semibold text-[var(--text-primary)]">New {itemName}</h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {/* The choice, shown as the thing being made: the selected mark at the
             size it will be recognised at. */}
          <div className="flex justify-center pt-4">
            <span aria-hidden="true" className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-foreground)]">
              <PreviewIcon className="h-10 w-10" />
            </span>
          </div>

          <label htmlFor="new-category-title" className="sr-only">{itemName === 'portal' ? 'Portal' : 'Category'} title</label>
          <input ref={fieldRef} disabled={isSaving} id="new-category-title" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={48} placeholder={`${itemName === 'portal' ? 'Portal' : 'Category'} title`} className="text-control mt-5 h-11 w-full px-3 text-center text-[15px] font-medium text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)]" />
          {error && <p role="alert" className="mt-2 text-[13px] text-[var(--text-primary)]">{error}</p>}

          {/* A radiogroup, not a row of buttons: exactly one mark is selected,
             and arrow keys move between them the way a single choice should. */}
          <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label={`${itemName === 'portal' ? 'Portal' : 'Category'} icon`} className="mt-5 grid grid-cols-6 gap-2.5 pb-2 sm:grid-cols-7">
            {categoryIconNames.map((name) => {
            const Icon = getCategoryIcon(name);
            const isSelected = name === iconName;
            return <button key={name} type="button" disabled={isSaving} role="radio" aria-checked={isSelected} tabIndex={isSelected ? 0 : -1} aria-label={name} onClick={() => setIconName(name)} className={`flex aspect-square items-center justify-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)] text-[var(--accent-text)] ring-2 ring-[var(--focus-ring)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </button>;
          })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--hairline)] px-6 py-4">
          <button type="button" disabled={isSaving} onClick={onCancel} className="dialog-action-button h-9 flex-1 rounded-[10px] bg-[var(--surface-sunken)] text-[13px] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            Cancel
          </button>
          {/* Disabled until there is a name, because a category with no title is
             not a thing that can be created. */}
          <button type="submit" disabled={!trimmed || isSaving} className="dialog-action-button h-9 flex-1 rounded-[10px] bg-[var(--accent-primary)] text-[13px] font-semibold text-[var(--accent-foreground)] transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
            {isSaving ? 'Creating…' : `Create ${itemName}`}
          </button>
        </div>
      </form>
    </div></ModalPortal>;
}
