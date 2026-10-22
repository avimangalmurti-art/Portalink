import React, { useEffect, useRef, useState } from 'react';
import { CheckIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import { getCategoryIcon, getPortalIconLabel, portalIconNames, searchPortalIcons } from './categoryIcons';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import { usePresentation } from '../../presentation/usePresentation';

const PAGE_SIZE = 60;

/** One bounded, searchable catalog for creating a portal or changing its icon. */
export function PortalIconLibrary({ selected, onSelect, disabled = false, pendingName, compact = false, label = 'Portal icon', searchQuery, additionalOptions = [] }: {
  additionalOptions?: readonly { name: string; label: string }[];
  selected: string;
  onSelect: (name: string) => void;
  disabled?: boolean;
  pendingName?: string | null;
  compact?: boolean;
  label?: string;
  /** When supplied, the parent owns the search field (including an empty query). */
  searchQuery?: string;
}) {
  const isMobile = usePresentation() === 'mobile';
  const moreRef = useRef<HTMLDivElement>(null);
  const [localQuery, setLocalQuery] = useState('');
  const query = searchQuery ?? localQuery;
  const [page, setPage] = useState({ query: '', limit: PAGE_SIZE });
  const limit = page.query === query ? page.limit : PAGE_SIZE;
  const [initialSelected] = useState(selected);
  const matches = [...new Set([...additionalOptions.filter(option=>(option.label+' '+option.name).toLowerCase().includes(query.toLowerCase().trim())).map(option=>option.name),...searchPortalIcons(query)])];
  // A saved selection remains easy to locate when reopening the picker.
  const ordered = !query.trim() && (portalIconNames.includes(initialSelected)||additionalOptions.some(option=>option.name===initialSelected))
    ? [initialSelected, ...matches.filter(name => name !== initialSelected)] : matches;
  const visible = ordered.slice(0, limit);
  const tabStop = visible.includes(selected) ? selected : visible[0];
  const hasMore = ordered.length > limit;

  useEffect(() => {
    const marker = moreRef.current;
    if (!isMobile || disabled || !hasMore || !marker) return;
    if (typeof IntersectionObserver === 'undefined') {
      setPage({ query, limit: ordered.length });
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!active || !entries.some(entry => entry.isIntersecting)) return;
      active = false;
      observer.disconnect();
      setPage({ query, limit: limit + PAGE_SIZE });
    }, { root: marker.closest('[data-portal-icon-scroll]'), rootMargin: '400px 0px' });
    observer.observe(marker);
    return () => { active = false; observer.disconnect(); };
  }, [isMobile, disabled, hasMore, query, limit, ordered.length]);

  return <section className="mt-5" aria-label="Icon library">
    {searchQuery === undefined && <div className="relative">
      <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[var(--text-secondary)]" />
      <input type="search" aria-label="Search icons" data-ui-shape="field" placeholder="Search icons" value={query} disabled={disabled}
        onChange={event => { setLocalQuery(event.target.value); setPage({ query: event.target.value, limit: PAGE_SIZE }); }}
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}
        className="text-control h-11 w-full pl-10 pr-3 text-base text-[var(--text-primary)]" />
    </div>}
    <p className="mb-3 mt-2 text-xs text-[var(--text-secondary)]" role="status">
      {matches.length ? `${matches.length.toLocaleString()} ${matches.length === 1 ? 'icon' : 'icons'}` : 'No icons found. Try another name.'}
    </p>
    <div role={compact ? 'radiogroup' : 'group'} aria-label={label}
      onKeyDown={compact ? handleRadioGroupKeyDown : undefined}
      className={compact ? 'grid grid-cols-4 gap-2.5 min-[380px]:grid-cols-5 sm:grid-cols-7' : 'grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'}>
      {visible.map(name => {
        const Icon = getCategoryIcon(name);
        const chosen = name === selected;
        const pending = disabled && pendingName === name;
        const extraOption = additionalOptions.find(option => option.name === name);
        const catalogTitle = getPortalIconLabel(name);
        const title = extraOption?.label ?? (additionalOptions.some(option => option.label === catalogTitle) ? catalogTitle + ' (outline)' : catalogTitle);
        const selectedStyle = compact ? 'border-[var(--accent-primary)] bg-[var(--surface-selected)] text-[var(--accent-text)]' : 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-foreground)]';
        return <button key={name} type="button" role={compact ? 'radio' : undefined}
          aria-label={compact ? title : `Use the ${title} icon`} title={title}
          aria-checked={compact ? chosen : undefined} aria-pressed={compact ? undefined : chosen}
          aria-busy={pending || undefined} disabled={disabled}
          tabIndex={compact ? (name === tabStop ? 0 : -1) : undefined}
          onClick={() => onSelect(name)}
          className={`relative flex aspect-square min-h-11 w-full items-center justify-center border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed ${compact ? 'shape-squircle-compact' : 'shape-container'} ${chosen ? selectedStyle : 'border-[var(--hairline)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'} ${disabled && !pending ? 'opacity-45' : ''}`}>
          <InterfaceIcon icon={pending ? Loader2Icon : Icon} size={compact ? 'lg' : 'xl'} keepColor className={pending ? 'animate-spin motion-reduce:animate-none' : undefined} />
          {chosen && !compact && !pending && <InterfaceIcon icon={CheckIcon} size="sm" keepColor className="absolute right-1 top-1" />}
        </button>;
      })}
    </div>
    {hasMore && (isMobile ? <div ref={moreRef} aria-hidden="true" className="h-px" /> :
      <button data-ui-shape="action" data-control-size="md" type="button" disabled={disabled} onClick={() => setPage({ query, limit: limit + PAGE_SIZE })}
        className="mt-3 min-h-11 w-full rounded-[10px] border border-[var(--hairline)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40">Show more icons</button>)}
  </section>;
}
