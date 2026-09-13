import { useMenuFocus } from '../../hooks/useMenuFocus';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, TypeIcon } from 'lucide-react';
import { scriptFallbackStack, typefaceCategories, typefaces } from '../../data/typefaces';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { usePresentation } from '../../presentation/usePresentation';
const DEFAULT_TYPEFACE_ID = 'default';
/**
 * Latin, Japanese kana, Devanagari, and Siddham (Bonji) in one run — the whole
 * point is that a single line mixing all four shapes correctly.
 */
const MULTI_SCRIPT_SPECIMEN = 'Hello / 今日は / नमस्ते / 𑖪𑖯';
type TypographyInspectorProps = {
  typefaceId: string;
  onTypefaceChange: (typefaceId: string) => void;
  /** The project menu owns typography now; the header variant remains reusable. */
  triggerVariant?: 'header' | 'menu';
  onSelectComplete?: () => void;
};

type PopoverPosition = {
  left: number;
  top: number;
};

/**
 * Typography lives with the project it changes: a quiet anchored inspector that
 * edits that project's own type tokens live. The project beside it is the preview.
 */
export function TypographyInspector({
  typefaceId,
  onTypefaceChange,
  triggerVariant = 'header',
  onSelectComplete
}: TypographyInspectorProps) {
  const presentation = usePresentation();
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useMenuFocus({ open: isOpen, menuRef: popoverRef, triggerRef, mode: 'dialog', onOpen: () => setIsOpen(true), onClose: () => setIsOpen(false) });

  const positionPopover = useCallback(() => {
    const trigger = containerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) {
      return;
    }

    const viewportGutter = 8;
    const anchorGap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    // The inspector belongs visually to the control, but lives above the page
    // so a narrow or collapsed sidebar can never clip it.
    let left = triggerRect.right + anchorGap;
    if (left + popoverRect.width > window.innerWidth - viewportGutter) {
      left = triggerRect.left - popoverRect.width - anchorGap;
    }
    left = Math.max(viewportGutter, Math.min(left, window.innerWidth - popoverRect.width - viewportGutter));

    const top = Math.max(
      viewportGutter,
      Math.min(triggerRect.top, window.innerHeight - popoverRect.height - viewportGutter)
    );

    setPopoverPosition({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null);
      return;
    }
    positionPopover();
  }, [isOpen, positionPopover]);


  useEffect(() => { if (!isOpen) return; window.addEventListener('resize', positionPopover); window.addEventListener('scroll', positionPopover, true); return () => { window.removeEventListener('resize', positionPopover); window.removeEventListener('scroll', positionPopover, true); }; }, [isOpen, positionPopover]);
  const selectTypeface = (nextTypefaceId: string) => {
    onTypefaceChange(nextTypefaceId);
    if (triggerVariant === 'menu') {
      setIsOpen(false);
      onSelectComplete?.();
    }
  };
  return <div ref={containerRef} className="relative shrink-0">
      {triggerVariant === 'menu' ? <button ref={triggerRef} type="button" role="menuitem" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-haspopup="dialog" className="flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={TypeIcon} size="sm" weight="medium" />
          Change typography…
        </button> : <button ref={triggerRef} type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-haspopup="dialog" aria-label="Project typography" title="Typography" className="side-panel-header-control side-panel-header-icon flex items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <TypeIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>}

      {/* Portaled above the work so neither the open nor collapsed sidebar can
         constrain its width, stacking order, or visible bounds. */}
      {isOpen && createPortal(<div ref={popoverRef} tabIndex={-1} data-presentation={presentation} data-typography-popover="" role="dialog" aria-label="Typography" style={popoverPosition ?? {
      left: 0,
      top: 0,
      visibility: 'hidden'
    }} className="fixed z-[120] flex max-h-[calc(100dvh-16px)] w-[min(330px,calc(100vw-16px))] flex-col overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-elevated)]">
          <div className="shrink-0 border-b border-[var(--hairline)] px-3.5 py-3">
            <h2 className="text-small font-bold text-[var(--text-primary)]">Typography</h2>
          </div>
          <div className="scrollbar-slim min-h-0 max-h-[380px] overflow-y-auto p-2">
            <TypefaceOption label="System Default" description="Matches the Portalink interface font" isSelected={typefaceId === DEFAULT_TYPEFACE_ID} onSelect={() => selectTypeface(DEFAULT_TYPEFACE_ID)} />
            {typefaceCategories.map((category) => <section key={category} className="mt-2">
                {/* Category headings stay in the interface font. */}
                <h3 className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{category}</h3>
                <ul className="m-0 list-none p-0">
                  {typefaces.filter((typeface) => typeface.category === category && typeface.id !== DEFAULT_TYPEFACE_ID).map((typeface) => <li key={typeface.id} className="list-none">
                        <TypefaceOption label={typeface.name} specimenStack={typeface.stack} isSelected={typeface.id === typefaceId} onSelect={() => selectTypeface(typeface.id)} />
                      </li>)}
                </ul>
              </section>)}
          </div>
        </div>, document.body)}
    </div>;
}
function TypefaceOption({
  label,
  description,
  specimenStack,
  isSelected,
  onSelect






}: {label: string;description?: string;specimenStack?: string;isSelected: boolean;onSelect: () => void;}) {
  return <button type="button" onClick={onSelect} aria-pressed={isSelected} className={`flex w-full items-center justify-between gap-3 rounded-[9px] px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)] hover:bg-[var(--surface-pressed)]' : 'hover:bg-[var(--surface-hover)] active:bg-[var(--surface-pressed)]'}`}>
      <span className="min-w-0">
        {/* Only the specimen adopts the typeface; labels stay in chrome type. */}
        <span data-font-preview="" style={specimenStack ? {
        fontFamily: `${specimenStack}, ${scriptFallbackStack}`
      } : undefined} className={`block truncate text-[17px] leading-snug ${isSelected ? 'font-semibold text-[var(--accent-text)]' : 'text-[var(--text-primary)]'}`}>{label}</span>
        {/* A multi-script line, so the specimen shows what the face actually
           does with Latin, Kanji, Devanagari, and Siddham rather than only the
           scripts it happens to cover. Never truncated and never on a fixed
           height: the taller scripts must be able to set their own bounds. */}
        <span data-font-preview="" style={specimenStack ? {
        fontFamily: `${specimenStack}, ${scriptFallbackStack}`
      } : undefined} lang="mul" className="mt-0.5 block text-[15px] leading-[1.6] text-[var(--text-secondary)]">{MULTI_SCRIPT_SPECIMEN}</span>
        {description && <span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{description}</span>}
      </span>
      {isSelected && <InterfaceIcon icon={CheckIcon} weight="semibold" keepColor className="text-[var(--accent-text)]" />}
    </button>;
}
