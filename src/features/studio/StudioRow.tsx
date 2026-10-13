import { plainFormattedText } from '../../components/text/textFormatting';
import React, { useId, useRef } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { InterfaceIcon, type InterfaceIconSource } from '../../components/ui/InterfaceIcon';
import { useStudioRowGesture } from './useStudioRowGesture';

export type StudioRowAction = {
  id: string;
  label: string;
  icon?: InterfaceIconSource;
  destructive?: boolean;
  disabled?: boolean;
  onAction: () => void;
};

export type StudioRowProps = {
  id: string;
  title: string;
  secondary?: string;
  actionLabel?: string;
  date?: string;
  referenceCount?: number;
  leading?: React.ReactNode;
  unread?: boolean;
  selecting: boolean;
  selected: boolean;
  pending?: boolean;
  onSelect: () => void;
  onOpen?: () => void;
  actions: StudioRowAction[];
  primaryAction?: StudioRowAction;
  onMenu: (trigger: HTMLElement) => void;
};

/** Row actions are reachable by hold, context menu, or keyboard; destructive actions never full-swipe. */
export function StudioRow({ id, title, secondary, actionLabel, date, referenceCount, leading, unread, selecting, selected, pending = false, onSelect, onOpen, actions, primaryAction, onMenu }: StudioRowProps) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const secondaryId = useId();
  const visibleActions = actions.slice(0, 3);
  const safePrimary = primaryAction && !primaryAction.disabled && !primaryAction.destructive ? primaryAction : undefined;
  function openMenu() {
    if (!menuRef.current || pending || selecting) return;
    menuRef.current.focus({ preventScroll: true });
    onMenu(menuRef.current);
  }
  const gesture = useStudioRowGesture({
    enabled: !pending && !selecting,
    leftCount: visibleActions.length,
    hasPrimary: Boolean(safePrimary),
    onPrimary: () => safePrimary?.onAction(),
    onMenu: openMenu,
  });
  const revealAction = (action: StudioRowAction) => <button key={action.id} type="button" disabled={pending || action.disabled} tabIndex={gesture.offset === 0 ? -1 : 0} onClick={() => { gesture.close(); action.onAction(); }} className={`flex min-h-[72px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 px-1 text-[12px] font-medium focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${action.destructive ? 'bg-[var(--status-danger)] text-white' : 'bg-[var(--accent-soft)] text-[var(--accent-text)]'}`}>
    {action.icon ? <InterfaceIcon icon={action.icon} /> : null}<span>{action.label}</span>
  </button>;

  return <li data-studio-row={id} data-selected={selected || undefined} className="relative overflow-hidden border-b border-[var(--hairline)]">
    {!selecting && gesture.offset > 0 && safePrimary ? <div className="absolute inset-y-0 left-0 flex" aria-label={`Quick action for ${title}`}>{revealAction(safePrimary)}</div> : null}
    {!selecting && gesture.offset < 0 ? <div className="absolute inset-y-0 right-0 flex" role="group" aria-label={`Actions for ${title}`}>{visibleActions.map(revealAction)}</div> : null}
    <div {...gesture.handlers} data-studio-row-surface="" className={`relative flex min-h-[80px] items-center bg-[var(--surface-raised)] motion-reduce:transition-none ${gesture.dragging ? '' : 'transition-transform duration-[var(--m-fast)] '}`} style={{ transform: `translateX(${gesture.offset}px)`, touchAction: selecting ? 'auto' : 'pan-y pinch-zoom' }}>
      {selecting ? <label data-studio-row-control="" className="flex h-11 w-11 shrink-0 items-center justify-center">
        <input type="checkbox" checked={selected} disabled={pending} onChange={onSelect} aria-label={`Select ${title}`} className="h-5 w-5 accent-[var(--accent-text)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
      </label> : null}
      <button ref={menuRef} type="button" onContextMenu={event => { event.preventDefault(); openMenu(); }} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); openMenu(); } }} disabled={pending || (!selecting && !onOpen)} aria-label={selecting ? `${selected ? 'Deselect' : 'Select'} ${title}` : `Open ${title}${unread ? ', unread' : ''}`} aria-describedby={secondary ? secondaryId : undefined} aria-pressed={selecting ? selected : undefined} onClick={() => { if (gesture.offset !== 0) gesture.close(); else if (selecting) onSelect(); else onOpen?.(); }} className={`flex min-h-[80px] min-w-0 flex-1 select-none items-center gap-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] disabled:opacity-60 ${selecting ? 'pr-2' : 'pl-3 pr-1'}`} style={{ WebkitTouchCallout: 'none' }}>
        {leading ? <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-[10px]">{leading}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">{unread ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent-text)]" /> : null}<span className={`block truncate text-[15px] ${unread ? 'font-semibold' : 'font-medium'}`}>{title}</span></span>
          {secondary ? <span id={secondaryId} className="studio-row-summary mt-1 block text-[13px] text-[var(--text-secondary)]">{plainFormattedText(secondary.replace(/<[^>]+>/g, '')).replace(/^\s*[•*–-]\s+/gm, '').replace(/\s+/g, ' ').trim()}</span> : null}
          {actionLabel ? <span className="studio-workbench-action">{actionLabel}</span> : null}
          {(date || (referenceCount ?? 0) > 0) && <span className="studio-row-metadata">{date && <span>{date}</span>}{(referenceCount ?? 0) > 0 && <span className="studio-reference-metadata">{referenceCount} references</span>}</span>}
        </span>
        {!selecting ? <span className="flex shrink-0 flex-col items-end gap-1 text-[var(--text-tertiary)]"><InterfaceIcon icon={ChevronRightIcon} size="xs" mirroredInRtl /></span> : null}
      </button>
    </div>
  </li>;
}
