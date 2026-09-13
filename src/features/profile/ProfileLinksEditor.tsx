import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../../hooks/useModalFocus';
import { createPortal } from 'react-dom';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { GripVerticalIcon, LinkIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
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
  onReorder: (linkIds: string[]) => void;
};

function ReorderableProfileLinkRow({
  link,
  index,
  total,
  errors,
  disabled,
  isConfirmingRemoval,
  onChange,
  onChooseIcon,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  link: EditableProfileLink;
  index: number;
  total: number;
  errors: ProfileLinkFieldError;
  disabled: boolean;
  isConfirmingRemoval: boolean;
  onChange: (patch: Partial<Pick<EditableProfileLink, 'label' | 'href' | 'iconName'>>) => void;
  onChooseIcon: () => void;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const dragControls = useDragControls();
  const shouldReduceMotion = useReducedMotion();
  const Icon = getCategoryIcon(link.iconName ?? 'globe');
  function updateDestination(patch: Pick<Partial<EditableProfileLink>, 'label' | 'href'>) {
    const nextLabel = patch.label ?? link.label;
    const nextHref = patch.href ?? link.href;
    const nextIconName = inferProfileLinkIconName(nextLabel, nextHref, link.iconName);
    onChange({
      ...patch,
      ...(nextIconName !== link.iconName ? { iconName: nextIconName } : {})
    });
  }

  return <Reorder.Item value={link.id} dragListener={false} dragControls={dragControls} layout="position" transition={{
    duration: shouldReduceMotion ? 0 : 0.16,
    ease: [0.22, 1, 0.36, 1]
  }} whileDrag={{
    zIndex: 120,
    scale: 1.015,
    boxShadow: '0 10px 24px rgba(0,0,0,0.16)'
  }} role="listitem" aria-label={`${link.label || 'Untitled link'}, position ${index + 1} of ${total}`} className="profile-link-editor-row relative min-w-0 list-none rounded-[12px] p-2.5">
      <div className="grid min-w-0 grid-cols-[18px_40px_minmax(0,1fr)_32px] items-start gap-2 sm:grid-cols-[18px_40px_minmax(110px,0.75fr)_minmax(160px,1.25fr)_32px]">
        <button type="button" aria-label={`Drag ${link.label || 'link'} to reorder`} onPointerDown={disabled ? undefined : (event) => dragControls.start(event)} disabled={disabled} className={`mt-[22px] flex h-8 w-[18px] shrink-0 touch-none items-center justify-center rounded-[6px] text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${disabled ? 'cursor-default opacity-40' : 'cursor-grab active:cursor-grabbing'}`}>
          <InterfaceIcon icon={GripVerticalIcon} size="sm" weight="medium" />
        </button>
        <button type="button" onClick={onChooseIcon} disabled={disabled} aria-label={`Choose icon for ${link.label || 'link'}`} className="shape-squircle-compact mt-[18px] flex h-10 w-10 items-center justify-center bg-[var(--surface-raised)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--hairline)] transition-colors hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <label htmlFor={`profile-link-label-${link.id}`} className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">Name</label>
          <input id={`profile-link-label-${link.id}`} value={link.label} onChange={(event) => updateDestination({ label: event.target.value })} maxLength={PROFILE_LINK_LABEL_MAX_LENGTH} disabled={disabled} placeholder="Instagram" aria-invalid={errors.label ? true : undefined} className="text-control h-10 w-full min-w-0 px-2.5 text-[12px] font-medium text-[var(--text-primary)]" />
          {errors.label ? <p className="mt-1 text-[10px] leading-tight text-[var(--status-danger)]">{errors.label}</p> : null}
        </div>
        <div className="col-span-2 col-start-3 min-w-0 sm:col-span-1 sm:col-start-auto">
          <label htmlFor={`profile-link-url-${link.id}`} className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">URL</label>
          <input id={`profile-link-url-${link.id}`} type="text" inputMode="url" value={link.href} onChange={(event) => updateDestination({ href: event.target.value })} maxLength={PROFILE_LINK_URL_MAX_LENGTH} disabled={disabled} placeholder="https://instagram.com/yourname" aria-invalid={errors.href ? true : undefined} className="text-control h-10 w-full min-w-0 px-2.5 text-[12px] text-[var(--text-primary)]" />
          {errors.href ? <p className="mt-1 text-[10px] leading-tight text-[var(--status-danger)]">{errors.href}</p> : null}
        </div>
        <button type="button" onClick={onRequestRemove} disabled={disabled} aria-label={`Remove ${link.label || 'link'}`} className="col-start-4 row-start-1 mt-[22px] flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--status-danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:col-start-auto sm:row-start-auto">
          <InterfaceIcon icon={Trash2Icon} size="sm" weight="medium" />
        </button>
        {isConfirmingRemoval ? <div className="col-span-full flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-2">
            <span className="mr-auto text-[11px] text-[var(--text-secondary)]">Remove this link?</span>
            <button type="button" onClick={onCancelRemove} className="h-7 rounded-[7px] px-2 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Cancel</button>
            <button type="button" onClick={onConfirmRemove} className="h-7 rounded-[7px] bg-[var(--status-danger)] px-2.5 text-[11px] font-semibold text-[var(--status-danger-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Remove</button>
          </div> : null}
      </div>
    </Reorder.Item>;
}

/** One sortable row per destination: the order, icon, label, and URL are edited
 * in one place so there is no competing chip list or second reorder system. */
export function ProfileLinksEditor({
  links,
  errors,
  disabled,
  onAdd,
  onChange,
  onRemove,
  onReorder,
}: ProfileLinksEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(links[0]?.id ?? null);
  const [isChoosingIcon, setIsChoosingIcon] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const [draftIconName, setDraftIconName] = useState('globe');
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId && links.some((link) => link.id === selectedId)) return;
    setSelectedId(links[0]?.id ?? null);
    setIsChoosingIcon(false);
    setIconQuery('');
  }, [links, selectedId]);

  const iconDialogRef = useRef<HTMLElement>(null);
  useModalFocus(isChoosingIcon && links.some((link) => link.id === selectedId), iconDialogRef, () => setIsChoosingIcon(false));
  useEffect(() => {
    if (!isChoosingIcon) return;
    const frame = requestAnimationFrame(() => iconDialogRef.current?.querySelector<HTMLInputElement>('input')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isChoosingIcon]);

  const selected = links.find((link) => link.id === selectedId) ?? null;
  const DraftIcon = getCategoryIcon(draftIconName);
  const draftIconOption = profileLinkIconOptions.find((option) => option.name === draftIconName) ?? null;
  const filteredIconOptions = useMemo(() => {
    const normalized = iconQuery.trim().toLowerCase();
    if (!normalized) return profileLinkIconOptions;
    return profileLinkIconOptions.filter((option) => `${option.label} ${option.name}`.toLowerCase().includes(normalized));
  }, [iconQuery]);

  const tabbableIconName = filteredIconOptions.find(option => option.name === draftIconName)?.name ?? filteredIconOptions[0]?.name;

  function chooseIcon(option: ProfileLinkIconOption) {
    if (!selected) return;
    onChange(selected.id, {
      iconName: option.name,
      ...(!selected.label.trim() && option.isBrand ? { label: option.label } : {})
    });
    setIsChoosingIcon(false);
    setIconQuery('');
  }

  function openIconPicker(linkId: string) {
    const link = links.find((candidate) => candidate.id === linkId);
    if (!link) return;
    setSelectedId(link.id);
    setDraftIconName(link.iconName ?? 'globe');
    setIconQuery('');
    setIsChoosingIcon(true);
  }

  function addLink() {
    const id = onAdd();
    if (id) {
      setSelectedId(id);
      setPendingRemovalId(null);
      setIsChoosingIcon(false);
      setIconQuery('');
    }
  }

  return <>
    <fieldset className="m-0 flex min-h-0 min-w-0 flex-col gap-3 border-0 p-0">
      <div className="flex min-h-9 items-start justify-between gap-3">
        <div>
          <legend className="p-0 text-[14px] font-semibold text-[var(--text-primary)]">Profile links</legend>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">Drag a handle to set the order viewers see.</p>
        </div>
        <button type="button" onClick={addLink} disabled={disabled || links.length >= MAX_PROFILE_LINKS} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
          <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
          Add link
        </button>
      </div>

      {links.length > 0 ? <Reorder.Group axis="y" values={links.map((link) => link.id)} onReorder={disabled ? () => undefined : onReorder} className="scrollbar-overlay m-0 flex max-h-[328px] list-none flex-col gap-2 overflow-y-auto p-0 pr-1" role="list" aria-label="Profile links">
          {links.map((link, index) => <ReorderableProfileLinkRow key={link.id} link={link} index={index} total={links.length} errors={errors[link.id] ?? {}} disabled={disabled} isConfirmingRemoval={pendingRemovalId === link.id} onChange={(patch) => onChange(link.id, patch)} onChooseIcon={() => openIconPicker(link.id)} onRequestRemove={() => setPendingRemovalId(link.id)} onCancelRemove={() => setPendingRemovalId(null)} onConfirmRemove={() => {
            onRemove(link.id);
            setPendingRemovalId(null);
          }} />)}
        </Reorder.Group> : <button type="button" onClick={addLink} disabled={disabled} className="flex min-h-10 self-start items-center justify-center gap-2 rounded-[10px] px-3 text-[14px] font-normal text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <InterfaceIcon icon={LinkIcon} size="sm" weight="medium" />
          Add your first link
        </button>}
    </fieldset>

    {isChoosingIcon && selected ? createPortal(
      <div role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsChoosingIcon(false);
      }} className="modal-scrim fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4">
        <section ref={iconDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="profile-link-icon-heading" onKeyDown={(event) => {
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
              <input type="search" value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search Instagram, YouTube, maps…" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none" />
            </label>

            <div role="radiogroup" onKeyDown={handleRadioGroupKeyDown} aria-label="Profile link icon" className="mt-5 grid grid-cols-5 gap-2.5 pb-2 sm:grid-cols-7">
              {filteredIconOptions.map((option) => {
                const Icon = getCategoryIcon(option.name);
                const isSelected = option.name === draftIconName;
                return <button key={option.name} type="button" role="radio" aria-checked={isSelected} tabIndex={option.name === tabbableIconName ? 0 : -1} aria-label={option.label} title={option.label} onClick={() => setDraftIconName(option.name)} className={`flex aspect-square items-center justify-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isSelected ? 'bg-[var(--surface-selected)] text-[var(--accent-text)] ring-2 ring-[var(--focus-ring)]' : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                  <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
                </button>;
              })}
            </div>
            {filteredIconOptions.length === 0 ? <p className="py-8 text-center text-[12px] text-[var(--text-secondary)]">No matching icons</p> : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] px-6 py-4">
            <button type="button" onClick={() => setIsChoosingIcon(false)} className="h-10 shrink-0 rounded-[10px] px-4 text-[14px] font-normal transition-colors duration-150 hover:bg-[var(--surface-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              Cancel
            </button>
            <button type="button" disabled={!draftIconOption} onClick={() => draftIconOption && chooseIcon(draftIconOption)} className="h-10 shrink-0 rounded-[10px] bg-[var(--accent-primary)] px-4 text-[14px] font-medium text-[var(--accent-foreground)] transition-opacity duration-150 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">
              Done
            </button>
          </div>
        </section>
      </div>,
      document.querySelector<HTMLElement>('.app-shell') ?? document.body
    ) : null}
  </>;
}
