import React, { useId, useState } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'framer-motion';
import { ChevronRightIcon, GripVerticalIcon, MinusCircleIcon, PlusIcon } from 'lucide-react';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { motionCurve, motionSeconds } from '../../presentation/motion/motion';
import type { EditableProfileLink, ProfileLinkFieldError } from './useProfileEditor';
import { isProfileLinkAction, MAX_PROFILE_LINKS } from './profileLinks';
import './profileLinksEditor.css';

type ProfileLinksEditorProps = {
  links: EditableProfileLink[];
  errors: Record<string, ProfileLinkFieldError>;
  disabled: boolean;
  compact?: boolean;
  onAdd: () => void;
  onEdit: (linkId: string) => void;
  onRemove: (linkId: string) => void;
  onReorder: (linkIds: string[]) => void;
};

function removeWithFocus(button: HTMLButtonElement, onRemove: () => void) {
  const ownerDocument = button.ownerDocument;
  const row = button.closest<HTMLElement>('.profile-links-item');
  const active = ownerDocument.activeElement;
  const next = row?.nextElementSibling?.matches('.profile-links-item') ? row.nextElementSibling : null;
  const previous = row?.previousElementSibling?.matches('.profile-links-item') ? row.previousElementSibling : null;
  const target = row && active && row.contains(active)
    ? next?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?? previous?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?? row.parentElement?.querySelector<HTMLButtonElement>('.profile-links-add:not(:disabled)')
    : null;
  onRemove();
  if (!row || !active || !target) return;
  ownerDocument.defaultView?.requestAnimationFrame(() => {
    // Do not take focus back from a later interaction, dialog or destination.
    if (row.isConnected || !target.isConnected || target.disabled || !target.getClientRects().length ||
      target.closest('[hidden], [inert], [aria-hidden="true"]') || ownerDocument.querySelector('[aria-modal="true"]')) return;
    const current = ownerDocument.activeElement;
    if (current === ownerDocument.body || current === active) target.focus({ preventScroll: true });
  });
}

function ProfileLinkRow({ link, index, total, error, editing, disabled, instructionsId, onEdit, onRemove, onMove, onDragEnd }: {
  link: EditableProfileLink;
  index: number;
  total: number;
  error: ProfileLinkFieldError;
  editing: boolean;
  disabled: boolean;
  instructionsId: string;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (destination: number) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const Icon = getCategoryIcon(link.iconName ?? 'globe');
  const name = link.label.trim() || 'Untitled link';
  const errorId = useId();
  const message = error.label || error.href;

  return <Reorder.Item value={link.id} dragListener={false} dragControls={controls} layout="position"
    transition={{ duration: reduceMotion ? 0 : motionSeconds('base'), ease: motionCurve() }}
    whileDrag={{ zIndex: 1 }} onDragStart={() => setDragging(true)} onDragEnd={() => { setDragging(false); onDragEnd(); }}
    role="listitem" aria-label={`${name}, position ${index + 1} of ${total}`}
    data-dragging={dragging || undefined} className="profile-links-item">
    <div className="profile-settings-row profile-links-row">
      {editing && <button type="button" className="profile-links-remove" data-semantic-action="" disabled={disabled}
        aria-label={`Remove ${name}`} onClick={event => removeWithFocus(event.currentTarget, onRemove)}>
        <InterfaceIcon icon={MinusCircleIcon} size="lg" keepColor />
      </button>}
      <button type="button" className="profile-links-open" disabled={disabled} onClick={onEdit}
        aria-label={`Edit ${name}`} aria-describedby={message ? errorId : undefined}>
        <span className="profile-links-icon" aria-hidden="true"><Icon /></span>
        <span className="profile-links-label">{name}{message && <span id={errorId} className="profile-links-error">{message}</span>}</span>
        {!editing && <InterfaceIcon icon={ChevronRightIcon} size="sm" mirroredInRtl className="profile-settings-chevron profile-links-chevron" />}
      </button>
      {editing && <button type="button" className="profile-links-reorder" disabled={disabled}
        aria-label={`Reorder ${name}`} aria-describedby={instructionsId} aria-keyshortcuts="ArrowUp ArrowDown Home End"
        title="Drag or use the arrow keys to reorder" onPointerDown={disabled ? undefined : event => controls.start(event)}
        onKeyDown={event => {
          const destination = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : event.key === 'Home' ? 0 : event.key === 'End' ? total - 1 : null;
          if (destination === null) return;
          event.preventDefault();
          if (!disabled) onMove(destination);
        }}>
        <InterfaceIcon icon={GripVerticalIcon} size="lg" />
      </button>}
    </div>
  </Reorder.Item>;
}

/** One draft list; link details are edited on the parent screen's child page. */
export function ProfileLinksEditor({ links, errors, disabled, onAdd, onEdit, onRemove, onReorder }: ProfileLinksEditorProps) {
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const headingId = useId();
  const listId = useId();
  const instructionsId = useId();
  const visibleLinks = links.filter(link => !isProfileLinkAction(link.action));

  function move(link: EditableProfileLink, destination: number) {
    if (disabled) return;
    const index = visibleLinks.findIndex(candidate => candidate.id === link.id);
    const target = Math.max(0, Math.min(visibleLinks.length - 1, destination));
    if (index < 0 || index === target) return;
    const reordered = [...visibleLinks];
    reordered.splice(index, 1);
    reordered.splice(target, 0, link);
    onReorder(reordered.map(candidate => candidate.id));
    setAnnouncement(`${link.label || 'Untitled link'} moved to position ${target + 1} of ${reordered.length}.`);
  }

  return <section className="profile-settings-section profile-links-editor" aria-labelledby={headingId}>
    <div className="profile-links-heading">
      <h2 id={headingId}>Profile links</h2>
      {visibleLinks.length > 0 && <button type="button" className="profile-settings-action profile-links-edit" data-semantic-action=""
        disabled={disabled} aria-pressed={editing} aria-controls={listId} onClick={() => setEditing(value => !value)}>{editing ? 'Done' : 'Edit'}</button>}
    </div>
    <p id={instructionsId} className="sr-only">Drag to reorder, or use the Up and Down arrow keys. Home moves to first and End moves to last.</p>
    <Reorder.Group id={listId} axis="y" values={visibleLinks.map(link => link.id)} role="list" aria-label="Profile links"
      className="profile-settings-group profile-links-group" onReorder={ids => { if (editing && !disabled) onReorder(ids); }}>
      {visibleLinks.map((link, index) => <ProfileLinkRow key={link.id} link={link} index={index} total={visibleLinks.length}
        error={errors[link.id] ?? {}} editing={editing} disabled={disabled} instructionsId={instructionsId}
        onEdit={() => onEdit(link.id)} onRemove={() => { if (!disabled) { onRemove(link.id); setAnnouncement(`${link.label || 'Untitled link'} removed.`); } }}
        onMove={destination => move(link, destination)} onDragEnd={() => setAnnouncement(`${link.label || 'Untitled link'} is at position ${index + 1} of ${visibleLinks.length}.`)} />)}
      <li className="profile-links-add-row">
        <button type="button" className="profile-settings-row profile-settings-action profile-links-add" data-semantic-action=""
          disabled={disabled || visibleLinks.length >= MAX_PROFILE_LINKS} onClick={onAdd}>
          <InterfaceIcon icon={PlusIcon} size="lg" keepColor /><span>Add link</span>
        </button>
      </li>
    </Reorder.Group>
    <p className="profile-links-footnote">Links appear on your public profile.</p>
    <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span>
  </section>;
}
