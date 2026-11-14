import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import type { PortfolioCategory } from '../../types/domain';
import { portalChildren } from '../../features/profile/portalHierarchy';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { getCategoryIcon } from './categoryIcons';

export function PortalChildren({ categories, parent, onSelect, renderActions }: {
  categories: PortfolioCategory[];
  parent: PortfolioCategory;
  onSelect: (id: string) => void;
  renderActions?: (child: PortfolioCategory) => React.ReactNode;
}) {
  const children = portalChildren(categories, parent.id);
  if (!children.length) return null;

  return <section aria-label={`Portals in ${parent.label}`} className="mb-2 border-b border-[var(--hairline)] pb-2">
    <p className="px-3 pb-1 pt-2 text-sm font-medium text-[var(--text-secondary)]">Portals</p>
    <ul className="m-0 list-none space-y-1 p-0">
      {children.map(child => {
        const actions = renderActions?.(child);
        return <li key={child.id} className="group/row flex min-w-0 items-center">
          <button type="button" data-ui-shape="action" title={child.label}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            onClick={() => onSelect(child.id)}>
            <InterfaceIcon icon={getCategoryIcon(child.iconName)} size="sm" />
            <span className="min-w-0 flex-1 truncate">{child.label}</span>
            <InterfaceIcon icon={ChevronRightIcon} mirroredInRtl size="sm" />
          </button>
          {actions && <div className="relative flex min-w-10 items-center self-stretch">{actions}</div>}
        </li>;
      })}
    </ul>
  </section>;
}
