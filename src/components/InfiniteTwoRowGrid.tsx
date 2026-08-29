import React, { Children, ReactNode } from 'react';
type InfiniteTwoRowGridProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
};
export function InfiniteTwoRowGrid({
  ariaLabel,
  children,
  className = '',
  compact = false
}: InfiniteTwoRowGridProps) {
  const items = Children.toArray(children);
  function renderItems(copy: 'before' | 'primary' | 'after', isInert = false) {
    return items.map((item, index) => <div key={`${copy}-${index}`} aria-hidden={isInert || undefined} inert={isInert || undefined} className="card-row-item shape-container overflow-hidden">
        {item}
      </div>);
  }
  return <div className={`two-row-card-grid ${compact ? 'two-row-card-grid--compact' : ''} ${className}`} role="list" aria-label={ariaLabel}>
      {renderItems('before', true)}
      {renderItems('primary')}
      {renderItems('after', true)}
    </div>;
}