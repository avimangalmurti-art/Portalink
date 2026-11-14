import React from 'react';
import { DndContext, KeyboardCode, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, rectSortingStrategy, verticalListSortingStrategy, type SortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'framer-motion';

export type MobileReorderActions = { moveUp?: () => void; moveDown?: () => void };

export type MobileReorderActivator = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: React.Ref<HTMLButtonElement>;
};

/** Hold the destination itself to move it; menus and inputs remain ordinary controls. */
export function MobileReorderList<T extends { id: string }>({
  items, label, disabled = false, className, itemClassName, groupForItem, isItemDisabled, layout = 'list',
  onReorder, renderItem,
}: {
  items: T[];
  layout?: 'list' | 'grid';
  label: string;
  disabled?: boolean;
  className: string;
  itemClassName?: string;
  groupForItem?: (item: T) => string;
  isItemDisabled?: (item: T) => boolean;
  onReorder: (items: T[], move: { from: number; to: number }) => void;
  renderItem: (item: T, activator: MobileReorderActivator, actions: MobileReorderActions) => React.ReactNode;
}) {
  // TouchSensor cancels when scrolling begins before the hold. Unlike disabling
  // touch-action on the whole row, it leaves ordinary vertical scrolling intact.
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 450, tolerance: 8 } });
  const mouse = useSensor(MouseSensor, { activationConstraint: { delay: 450, tolerance: 8 } });
  const keyboard = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
    keyboardCodes: { start: [KeyboardCode.Space], cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space, KeyboardCode.Enter] },
  });
  const sensors = useSensors(touch, mouse, keyboard);
  const baseStrategy = layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy;
  const strategy: SortingStrategy = args => {
    if (!isItemDisabled || !groupForItem) return baseStrategy(args);
    if (args.activeIndex < 0 || args.overIndex < 0) return null;
    // Preview the same eligible slots the caller can reorder on drop.
    const group = groupForItem(items[args.activeIndex]);
    const slots = items.map((item, index) => ({ item, index }))
      .filter(({ item }) => !isItemDisabled(item) && groupForItem(item) === group)
      .map(({ index }) => index);
    return slots.includes(args.index) ? baseStrategy({
      ...args,
      activeIndex: slots.indexOf(args.activeIndex),
      overIndex: slots.indexOf(args.overIndex),
      index: slots.indexOf(args.index),
      rects: slots.map(index => args.rects[index]),
    }) : null;
  };
  const collisionDetection: CollisionDetection = args => {
    const source = items.find(item => item.id === args.active.id);
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(container => {
      const target = items.find(item => item.id === container.id);
      return source && target && !isItemDisabled?.(target) && (!groupForItem || groupForItem(source) === groupForItem(target));
    }) });
  };
  const moveAction = (index: number, delta: -1 | 1) => {
    const destination = index + delta;
    if (disabled || destination < 0 || destination >= items.length || isItemDisabled?.(items[index]) || isItemDisabled?.(items[destination])
      || (groupForItem && groupForItem(items[index]) !== groupForItem(items[destination]))) return undefined;
    return () => onReorder(arrayMove(items, index, destination), { from: index, to: destination });
  };
  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    accessibility={{ screenReaderInstructions: { draggable: 'Hold to move. With a keyboard, press Space, use the arrow keys to reposition, and press Space to drop. Press Escape to cancel.' } }}
    onDragEnd={({ active, over }) => {
      if (disabled || !over || active.id === over.id) return;
      const from = items.findIndex(item => item.id === active.id);
      const to = items.findIndex(item => item.id === over.id);
      if (from < 0 || to < 0 || isItemDisabled?.(items[from]) || isItemDisabled?.(items[to])
        || (groupForItem && groupForItem(items[from]) !== groupForItem(items[to]))) return;
      // Sortable previews movement with transforms. Only release writes an order,
      // so cancellation is reversible and one gesture cannot race multiple saves.
      onReorder(arrayMove(items, from, to), { from, to });
    }}>
    <SortableContext items={items.map(item => item.id)} strategy={strategy}>
      <ul aria-label={label} className={className}>
        {items.map((item, index) => {
          const itemDisabled = Boolean(isItemDisabled?.(item));
          return <MobileReorderRow key={item.id} id={item.id} disabled={disabled || items.length < 2 || itemDisabled}
            skipDrop={itemDisabled} className={itemClassName}>
            {activator => renderItem(item, activator, { moveUp: moveAction(index, -1), moveDown: moveAction(index, 1) })}
          </MobileReorderRow>;
        })}
      </ul>
    </SortableContext>
  </DndContext>;
}

function MobileReorderRow({ id, disabled, skipDrop, className, children }: {
  id: string;
  disabled: boolean;
  skipDrop: boolean;
  className?: string;
  children: (activator: MobileReorderActivator) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled: { draggable: disabled, droppable: skipDrop },
  });
  const reducedMotion = useReducedMotion();
  return <li ref={setNodeRef} className={className} data-mobile-reorder-row="" data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition: reducedMotion ? 'none' : transition, position: 'relative', zIndex: isDragging ? 2 : undefined }}>
    {children(disabled ? {} : {
      ...attributes, ...listeners, ref: setActivatorNodeRef,
      'data-mobile-reorder-activator': '',
      // A touch callout would steal the same long press from the sorting sensor.
      onContextMenu: event => event.preventDefault(),
    } as MobileReorderActivator)}
  </li>;
}
