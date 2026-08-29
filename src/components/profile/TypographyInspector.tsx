import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, TypeIcon } from 'lucide-react';
import { scriptFallbackStack, typefaceCategories, typefaces } from '../../data/typefaces';
import { InterfaceIcon } from '../ui/InterfaceIcon';
const DEFAULT_TYPEFACE_ID = 'default';
/**
 * Latin, Japanese kana, Devanagari, and Siddham (Bonji) in one run — the whole
 * point is that a single line mixing all four shapes correctly.
 */
const MULTI_SCRIPT_SPECIMEN = 'Hello / 今日は / नमस्ते / 𑖪𑖯';
type TypographyInspectorProps = {
  typefaceId: string;
  onTypefaceChange: (typefaceId: string) => void;
};

/**
 * Typography lives with the other authoring controls, in the portal sidebar: a
 * quiet anchored inspector that edits the open project's own type tokens live.
 * The project beside it is the only preview.
 */
export function TypographyInspector({
  typefaceId,
  onTypefaceChange
}: TypographyInspectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    function closeOnOutsideTap(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideTap);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideTap);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);
  return <div ref={containerRef} className="relative shrink-0">
      {/* Matches the collapse and new-project controls it now sits beside. */}
      <button type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-haspopup="dialog" aria-label="Project typography" title="Typography" className="side-panel-header-control side-panel-header-icon flex items-center justify-center rounded-[8px] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        <TypeIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      {/* Opens toward the work rather than away from it: anchored left, the panel
         is wider than the sidebar and would otherwise run off the edge. */}
      {isOpen && <div role="dialog" aria-label="Typography" className="absolute left-0 top-11 z-30 w-[330px] overflow-hidden rounded-[12px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] shadow-[var(--shadow-elevated)]">
          <div className="border-b border-[var(--hairline)] px-3.5 py-3">
            <h2 className="text-small font-bold text-[var(--text-primary)]">Typography</h2>
          </div>
          <div className="scrollbar-slim max-h-[380px] overflow-y-auto p-2">
            <TypefaceOption label="System Default" description="Matches the Portalink interface font" isSelected={typefaceId === DEFAULT_TYPEFACE_ID} onSelect={() => onTypefaceChange(DEFAULT_TYPEFACE_ID)} />
            {typefaceCategories.map((category) => <section key={category} className="mt-2">
                {/* Category headings stay in the interface font. */}
                <h3 className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{category}</h3>
                <ul className="m-0 list-none p-0">
                  {typefaces.filter((typeface) => typeface.category === category && typeface.id !== DEFAULT_TYPEFACE_ID).map((typeface) => <li key={typeface.id} className="list-none">
                        <TypefaceOption label={typeface.name} specimenStack={typeface.stack} isSelected={typeface.id === typefaceId} onSelect={() => onTypefaceChange(typeface.id)} />
                      </li>)}
                </ul>
              </section>)}
          </div>
        </div>}
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
