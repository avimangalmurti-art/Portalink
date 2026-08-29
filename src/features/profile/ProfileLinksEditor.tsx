import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon, LinkIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import { getCategoryIcon, profileLinkIconOptions, type ProfileLinkIconOption } from '../../components/profile/categoryIcons';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import type { EditableProfileLink, ProfileLinkFieldError } from './useProfileEditor';
import { inferProfileLinkIconName, MAX_PROFILE_LINKS } from './profileLinks';
import { PROFILE_LINK_LABEL_MAX_LENGTH, PROFILE_LINK_URL_MAX_LENGTH } from './validation';

type ProfileLinksEditorProps = {
  links: EditableProfileLink[];
  errors: Record<string, ProfileLinkFieldError>;
  disabled: boolean;
  onAdd: () => string | null;
  onChange: (linkId: string, patch: Partial<Pick<EditableProfileLink, 'label' | 'href' | 'iconName'>>) => void;
  onRemove: (linkId: string) => void;
  onMove: (linkId: string, direction: -1 | 1) => void;
  onReorder: (linkIds: string[]) => void;
};

function ReorderableProfileLinkTile({
  link,
  index,
  total,
  isSelected,
  hasError,
  disabled,
  onSelect,
}: {
  link: EditableProfileLink;
  index: number;
  total: number;
  isSelected: boolean;
  hasError: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const dragControls = useDragControls();
  const shouldReduceMotion = useReducedMotion();
  const isDraggingRef = useRef(false);
  const Icon = getCategoryIcon(link.iconName ?? 'globe');

  return <Reorder.Item value={link.id} dragListener={false} dragControls={dragControls} layout="position" transition={{
    duration: shouldReduceMotion ? 0 : 0.16,
    ease: [0.22, 1, 0.36, 1]
  }} whileDrag={{
    zIndex: 120,
    scale: 1.015,
    boxShadow: '0 10px 24px rgba(0,0,0,0.16)'
  }} onDragStart={() => {
    isDraggingRef.current = true;
  }} onDragEnd={() => {
    window.setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  }} className="relative min-w-0 max-w-full list-none">
      <button type="button" role="listitem" onClick={() => {
        if (!isDraggingRef.current) onSelect();
      }} aria-pressed={isSelected} aria-label={`${link.label || 'Untitled link'}, position ${index + 1} of ${total}. Drag to reorder.`} className={`shape-compact inline-flex h-7 max-w-full min-w-0 items-center gap-1 px-1.5 text-left transition-[color,background-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)] text-[var(--text-primary)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'} ${hasError ? 'ring-1 ring-inset ring-[var(--status-danger)]' : ''}`}>
        <span data-profile-link-drag-handle="" aria-hidden="true" title="Drag to reorder" onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }} onPointerDown={disabled ? undefined : (event) => dragControls.start(event)} className={`flex h-5 w-3.5 shrink-0 touch-none items-center justify-center text-[var(--text-tertiary)] ${disabled ? 'cursor-default opacity-40' : 'cursor-grab active:cursor-grabbing'}`}>
          <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="cdx-dense-label min-w-0 max-w-[160px] truncate pr-1 text-[11px] font-medium" title={link.label || 'Untitled link'}>{link.label || 'Untitled link'}</span>
      </button>
    </Reorder.Item>;
}

/**
 * Compact master/detail editing keeps the whole profile dialog on one screen:
 * the list shows every saved destination, while only the selected link exposes
 * its fields and icon palette.
 */
export function ProfileLinksEditor({
  links,
  errors,
  disabled,
  onAdd,
  onChange,
  onRemove,
  onMove,
  onReorder,
}: ProfileLinksEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(links[0]?.id ?? null);
  const [isChoosingIcon, setIsChoosingIcon] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const [draftIconName, setDraftIconName] = useState('globe');

  useEffect(() => {
    if (selectedId && links.some((link) => link.id === selectedId)) return;
    setSelectedId(links[0]?.id ?? null);
    setIsChoosingIcon(false);
    setIconQuery('');
  }, [links, selectedId]);

  const selectedIndex = links.findIndex((link) => link.id === selectedId);
  const selected = selectedIndex >= 0 ? links[selectedIndex] : null;
  const selectedErrors = selected ? errors[selected.id] ?? {} : {};
  const SelectedIcon = getCategoryIcon(selected?.iconName ?? 'globe');
  const DraftIcon = getCategoryIcon(draftIconName);
  const draftIconOption = profileLinkIconOptions.find((option) => option.name === draftIconName) ?? null;
  const filteredIconOptions = useMemo(() => {
    const normalized = iconQuery.trim().toLowerCase();
    if (!normalized) return profileLinkIconOptions;
    return profileLinkIconOptions.filter((option) => `${option.label} ${option.name}`.toLowerCase().includes(normalized));
  }, [iconQuery]);

  function chooseIcon(option: ProfileLinkIconOption) {
    if (!selected) return;
    onChange(selected.id, {
      iconName: option.name,
      ...(!selected.label.trim() && option.isBrand ? { label: option.label } : {})
    });
    setIsChoosingIcon(false);
    setIconQuery('');
  }

  function openIconPicker() {
    if (!selected) return;
    setDraftIconName(selected.iconName ?? 'globe');
    setIconQuery('');
    setIsChoosingIcon(true);
  }

  function addLink() {
    const id = onAdd();
    if (id) {
      setSelectedId(id);
      setIsChoosingIcon(false);
      setIconQuery('');
    }
  }

  function updateDestination(patch: Pick<Partial<EditableProfileLink>, 'label' | 'href'>) {
    if (!selected) return;
    const nextLabel = patch.label ?? selected.label;
    const nextHref = patch.href ?? selected.href;
    const nextIconName = inferProfileLinkIconName(nextLabel, nextHref, selected.iconName);
    onChange(selected.id, {
      ...patch,
      ...(nextIconName !== selected.iconName ? { iconName: nextIconName } : {})
    });
  }

  return <>
    <fieldset className="m-0 flex min-h-0 min-w-0 flex-col gap-2 border-0 p-0">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div>
          <legend className="p-0 text-[13px] font-semibold text-[var(--text-primary)]">Profile links</legend>
          <p className="text-[11px] leading-tight text-[var(--text-tertiary)]">Add any destination, choose its icon, and drag to reorder.</p>
        </div>
        <button type="button" onClick={addLink} disabled={disabled || links.length >= MAX_PROFILE_LINKS} className="shape-compact inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
          <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
          Add link
        </button>
      </div>

      {links.length > 0 ? <Reorder.Group axis="y" values={links.map((link) => link.id)} onReorder={disabled ? () => undefined : onReorder} className="scrollbar-hidden flex max-h-[96px] flex-wrap content-start gap-1.5 overflow-y-auto p-0" role="list" aria-label="Profile links">
          {links.map((link, index) => <ReorderableProfileLinkTile key={link.id} link={link} index={index} total={links.length} isSelected={selectedId === link.id} hasError={Boolean(errors[link.id]?.label || errors[link.id]?.href)} disabled={disabled} onSelect={() => {
            setSelectedId(link.id);
            setIsChoosingIcon(false);
            setIconQuery('');
          }} />)}
        </Reorder.Group> : <button type="button" onClick={addLink} disabled={disabled} className="shape-compact flex h-14 items-center justify-center gap-2 border border-dashed border-[var(--hairline-strong)] text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={LinkIcon} size="sm" weight="medium" />
          Add your first link
        </button>}

      {selected ? <div className="shape-compact relative grid grid-cols-[40px_minmax(0,0.7fr)_minmax(0,1.3fr)] gap-2 bg-[var(--surface-sunken)] p-2">
          <div className="relative">
            <button type="button" onClick={openIconPicker} disabled={disabled} aria-expanded={isChoosingIcon} aria-haspopup="dialog" aria-label={`Choose icon for ${selected.label || 'link'}`} title="Choose icon" className="shape-squircle-compact flex h-10 w-10 items-center justify-center bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--hairline)] transition-colors hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <SelectedIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </div>

          <div className="min-w-0">
            <label htmlFor={`profile-link-label-${selected.id}`} className="sr-only">Link label</label>
            <input id={`profile-link-label-${selected.id}`} value={selected.label} onChange={(event) => updateDestination({ label: event.target.value })} maxLength={PROFILE_LINK_LABEL_MAX_LENGTH} disabled={disabled} placeholder="Label" aria-invalid={selectedErrors.label ? true : undefined} className="text-control h-10 w-full min-w-0 px-2.5 text-[12px] font-medium text-[var(--text-primary)]" />
            {selectedErrors.label ? <p className="mt-1 text-[10px] leading-tight text-[var(--status-danger)]">{selectedErrors.label}</p> : null}
          </div>
          <div className="min-w-0">
            <label htmlFor={`profile-link-url-${selected.id}`} className="sr-only">Destination URL</label>
            <input id={`profile-link-url-${selected.id}`} type="text" inputMode="url" value={selected.href} onChange={(event) => updateDestination({ href: event.target.value })} maxLength={PROFILE_LINK_URL_MAX_LENGTH} disabled={disabled} placeholder="https://instagram.com/yourname" aria-invalid={selectedErrors.href ? true : undefined} className="text-control h-10 w-full min-w-0 px-2.5 text-[12px] text-[var(--text-primary)]" />
            {selectedErrors.href ? <p className="mt-1 text-[10px] leading-tight text-[var(--status-danger)]">{selectedErrors.href}</p> : null}
          </div>

          <div className="col-span-3 flex items-center justify-end gap-1 border-t border-[var(--hairline)] pt-1.5">
            <button type="button" onClick={() => onMove(selected.id, -1)} disabled={disabled || selectedIndex <= 0} aria-label="Move link earlier" className="shape-compact flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-35">
              <InterfaceIcon icon={ChevronUpIcon} size="sm" weight="medium" />
            </button>
            <button type="button" onClick={() => onMove(selected.id, 1)} disabled={disabled || selectedIndex === links.length - 1} aria-label="Move link later" className="shape-compact flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-35">
              <InterfaceIcon icon={ChevronDownIcon} size="sm" weight="medium" />
            </button>
            <button type="button" onClick={() => onRemove(selected.id)} disabled={disabled} aria-label={`Remove ${selected.label || 'link'}`} className="shape-compact ml-1 flex h-7 w-7 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--status-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={Trash2Icon} size="sm" weight="medium" />
            </button>
          </div>
        </div> : null}
    </fieldset>

    {isChoosingIcon && selected ? createPortal(
      <div role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsChoosingIcon(false);
      }} className="modal-scrim fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="profile-link-icon-heading" onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setIsChoosingIcon(false);
          }
        }} className="flex max-h-[min(720px,92dvh)] w-full max-w-[560px] flex-col overflow-hidden rounded-[16px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[0_24px_60px_rgba(0,0,0,0.34)]">
          <div className="relative flex shrink-0 items-center justify-center px-4 pb-2 pt-4">
            <button type="button" onClick={() => setIsChoosingIcon(false)} aria-label="Close icon picker" className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              <InterfaceIcon icon={XIcon} size="lg" weight="medium" />
            </button>
            <h2 id="profile-link-icon-heading" className="text-medium font-semibold">Choose link icon</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <div className="flex justify-center pt-4">
              <span aria-hidden="true" className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-foreground)]">
                <DraftIcon className="h-10 w-10" />
              </span>
            </div>
            <p className="mt-3 text-center text-[12px] font-medium text-[var(--text-secondary)]">
              {draftIconOption?.label ?? (selected.label || 'Profile link')}
            </p>

            <label className="text-control-shell mt-5 flex h-11 items-center gap-2 rounded-[10px] px-3">
              <InterfaceIcon icon={SearchIcon} size="sm" weight="medium" className="text-[var(--text-tertiary)]" />
              <span className="sr-only">Search link icons</span>
              <input type="search" value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} autoFocus placeholder="Search Instagram, YouTube, maps…" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
            </label>

            <div role="radiogroup" aria-label="Profile link icon" className="mt-5 grid grid-cols-5 gap-2.5 pb-2 sm:grid-cols-7">
              {filteredIconOptions.map((option) => {
                const Icon = getCategoryIcon(option.name);
                const isSelected = option.name === draftIconName;
                return <button key={option.name} type="button" role="radio" aria-checked={isSelected} aria-label={option.label} title={option.label} onClick={() => setDraftIconName(option.name)} className={`flex aspect-square items-center justify-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)] text-[var(--accent-text)] ring-2 ring-[var(--focus-ring)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                </button>;
              })}
            </div>
            {filteredIconOptions.length === 0 ? <p className="py-8 text-center text-[12px] text-[var(--text-secondary)]">No matching icons</p> : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-[var(--hairline)] px-6 py-4">
            <button type="button" onClick={() => setIsChoosingIcon(false)} className="h-9 flex-1 rounded-[10px] bg-[var(--surface-sunken)] text-[13px] font-semibold transition-colors duration-150 hover:bg-[var(--surface-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              Cancel
            </button>
            <button type="button" disabled={!draftIconOption} onClick={() => draftIconOption && chooseIcon(draftIconOption)} className="h-9 flex-1 rounded-[10px] bg-[var(--accent-primary)] text-[13px] font-semibold text-[var(--accent-foreground)] transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
              Done
            </button>
          </div>
        </section>
      </div>,
      document.querySelector<HTMLElement>('.app-shell') ?? document.body
    ) : null}
  </>;
}
