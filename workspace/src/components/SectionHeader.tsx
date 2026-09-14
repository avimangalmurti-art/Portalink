import React, { ReactNode } from 'react';
type SectionHeaderProps = {
  id: string;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  detail?: ReactNode;
  actions?: ReactNode;
  className?: string;
};
export function SectionHeader({
  id,
  title,
  eyebrow,
  subtitle,
  detail,
  actions,
  className = ''
}: SectionHeaderProps) {
  return <header className={`flex items-center justify-between gap-4 ${className}`}>
      
      {(detail || actions) && <div className="ml-auto flex shrink-0 items-center gap-3 pb-0.5">
          {detail && <span className="text-small font-medium text-[var(--text-secondary)]">{detail}</span>}
          {actions}
        </div>}
    </header>;
}
