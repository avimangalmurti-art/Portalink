import { motionMs, motionEase } from '../../presentation/motion/motion';
import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'framer-motion';
import { GripVerticalIcon } from 'lucide-react';
import { usePresentation } from '../../presentation/usePresentation';
import { SingleTouchSensor } from '../../presentation/mobile/SingleTouchSensor';

import { ImageWallRows, type ImageWallCardProps, type ImageWallRowsProps } from './ImageWallLayout';

/**
 * Prefer the card under the pointer, then fall back to the closest card centre.
 * The fallback is what makes the empty gutter between two cards a useful drop
 * target instead of a dead strip that ignores the creator's gesture.
 */
const gapAwareCollisionDetection: CollisionDetection = (args) => {
  const directHits = pointerWithin(args);
  return directHits.length > 0 ? directHits : closestCenter(args);
};

function SortableWallCard({
  item,
  itemIndex,
  itemCount,
  rowJustified,
  isReordering,
  isDisabled,
  shouldReduceMotion,
  reorderMode,
}: ImageWallCardProps) {
  const isMobile = usePresentation() === 'mobile';
  const canHoldToReorder = Boolean(reorderMode?.onStart) && !isDisabled;
  const canSort = !isDisabled && (isReordering || canHoldToReorder);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.key,
    disabled: !canSort,
    transition: shouldReduceMotion ? null : {
      duration: motionMs('base'),
      easing: motionEase(),
    },
    animateLayoutChanges: (args) => !shouldReduceMotion && defaultAnimateLayoutChanges(args),
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isReordering || isDisabled) return;
    if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
      event.preventDefault();
      reorderMode?.onMoveByOffset(item.key, -1);
      return;
    }
    if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
      event.preventDefault();
      reorderMode?.onMoveByOffset(item.key, 1);
      return;
    }
    listeners?.onKeyDown?.(event);
  };
  const visualTransform = isDragging && transform
    ? { ...transform, scaleX: 1, scaleY: 1 }
    : transform;
  const startFromArtwork = (event: React.SyntheticEvent, name: 'onTouchStart' | 'onMouseDown') => {
    if ((event.target as HTMLElement).closest('[data-preview-open]')) listeners?.[name]?.(event);
  };

  return <div
    ref={setNodeRef}
    role="listitem"
    data-project-preview-cell=""
    className={`min-w-0 ${isReordering ? 'will-change-transform' : ''} ${isDragging ? 'z-30 opacity-90 drop-shadow-[0_16px_30px_rgba(0,0,0,0.32)]' : ''}`}
    style={{
      flex: rowJustified ? `1 1 ${item.width}px` : `0 0 ${item.width}px`,
      '--project-cover-height': `${item.height}px`,
      alignSelf: 'flex-start',
      transform: CSS.Transform.toString(visualTransform),
      transition: shouldReduceMotion ? undefined : transition,
    } as React.CSSProperties}
  >
      <div
        ref={canSort ? setActivatorNodeRef : undefined}
        {...(isReordering ? attributes : {})}
        {...(canSort ? isReordering ? listeners : {
          onTouchStart: (event: React.TouchEvent) => startFromArtwork(event, 'onTouchStart'),
          onMouseDown: (event: React.MouseEvent) => startFromArtwork(event, 'onMouseDown'),
        } : {})}
        data-profile-hold-reorder={canHoldToReorder || undefined}
        aria-describedby={isReordering ? 'profile-project-reorder-instructions' : undefined}
        aria-label={isReordering ? `Project ${itemIndex + 1} of ${itemCount}; drag to reorder` : undefined}
        onKeyDown={isReordering ? handleKeyDown : undefined}
        className={`w-full min-w-0 ${isReordering ? `cursor-grab ${isMobile ? 'touch-pan-y' : 'touch-none'} rounded-[9px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] active:cursor-grabbing` : ''}`}
      >
        <div className={`relative w-full ${isReordering ? 'profile-project-reorder-card rounded-[8px] ring-2 ring-inset ring-[var(--accent-primary)]' : ''}`} style={isReordering ? {
          animationDelay: `${itemIndex % 5 * -75}ms`,
          animationDuration: 'var(--m-fast)'
        } : undefined}>
          <div className={isReordering ? 'pointer-events-none w-full select-none' : 'w-full'}>
            {item.content}
          </div>
          {isReordering ? <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-30 inline-flex h-7 items-center gap-1 rounded-full bg-[var(--surface-raised)] px-2 text-[10px] font-semibold tabular-nums text-[var(--accent-text)] shadow-[var(--shadow-pop)]">
              <GripVerticalIcon className="h-3.5 w-3.5" />
              {itemIndex + 1}
            </span> : null}
        </div>
      </div>
    </div>;
}

export function ReorderableImageWall(props: ImageWallRowsProps) {
  const { items, reorderMode } = props;
  const isMobile = usePresentation() === 'mobile';
  const shouldReduceMotion = useReducedMotion();
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(SingleTouchSensor, {
    // A swipe scrolls; a brief stationary hold picks up a card for dragging.
    activationConstraint: { delay: reorderMode?.enabled ? 250 : 450, tolerance: 8 },
  });
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: isMobile && !reorderMode?.enabled ? { delay: 450, tolerance: 8 } : { distance: 6 },
  });
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  // dnd-kit uses the sensor list as effect dependencies: keep its length stable
  // when resizing. PointerSensor wins mouse activation on WEB; MouseSensor is
  // its fallback and complements TouchSensor on the owner's mobile profile.
  const sensors = useSensors(isMobile && reorderMode ? touchSensor : pointerSensor, mouseSensor, keyboardSensor);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!reorderMode?.enabled || reorderMode.disabled || !over || active.id === over.id) return;
    reorderMode.onMove(String(active.id), String(over.id));
  };
  return <DndContext sensors={sensors} collisionDetection={gapAwareCollisionDetection} onDragStart={() => {
    if (!reorderMode?.enabled && !reorderMode?.disabled) reorderMode?.onStart?.();
  }} onDragEnd={handleDragEnd}>
    <SortableContext items={items.map(item => item.key)} strategy={rectSortingStrategy} disabled={(!reorderMode?.enabled && !reorderMode?.onStart) || reorderMode?.disabled}>
      <ImageWallRows {...props} Card={SortableWallCard} shouldReduceMotion={Boolean(shouldReduceMotion)} />
    </SortableContext>
  </DndContext>;
}
