import React from 'react';
import { BookmarkIcon, HeartIcon, Repeat2Icon, SendIcon } from 'lucide-react';
import { describeEngagement, ENGAGEMENT_KINDS } from '../../types/engagement';
import type { EngagementKind } from '../../types/engagement';
import type { ProjectEngagementLifecycle } from './useProjectEngagement';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';

/**
 * The like / save / repost controls.
 *
 * Purely presentational: it receives the lifecycle and calls it. It knows nothing
 * about services, auth, or optimism.
 *
 * Three details that matter:
 *
 * - State is never colour alone. Each control carries `aria-pressed`, its label
 *   changes ("Like" → "Liked"), and the glyph fills — so the state survives
 *   greyscale, high contrast, and a screen reader.
 * - A count is rendered ONLY when the service reports one. A null total shows no
 *   number rather than a zero the product cannot stand behind.
 * - A guest's control is not disabled: pressing it opens the sign-in gate, which
 *   is more useful than an inert button with no explanation.
 */
const ICONS: Record<EngagementKind, typeof HeartIcon> = {
  like: HeartIcon,
  save: BookmarkIcon,
  repost: Repeat2Icon
};

/** Selected engagement states keep their meaning across every creator accent. */
const SELECTED_COLORS: Record<EngagementKind, string> = {
  like: 'var(--engagement-like-selected)',
  save: 'var(--engagement-save-selected)',
  repost: 'var(--engagement-repost-selected)'
};

export function EngagementBar({
  engagement,
  projectTitle,
  size = 'default',
  showCounts = false,
  variant = 'inline',
  isShared = false,
  onShare











}: {engagement: ProjectEngagementLifecycle;projectTitle: string;size?: 'default' | 'compact';showCounts?: boolean; /**
   * `inline` packs the three controls into a row of chips, for a card.
   * `panel` gives each one its own column — glyph and total on one line, the word
   * beneath — for the project rail, where there is width and the counts are being
   * read rather than glanced at. `rail` stacks the icon controls vertically when
   * the project rail is collapsed.
   */variant?: 'inline' | 'panel' | 'rail'; /** Reports successful sharing without conflating it with a social count. */isShared?: boolean;onShare?: () => void;}) {const interfaceIconSize = size === 'compact' ? 'sm' : 'md';const isPanel = variant === 'panel';const isRail = variant === 'rail';const shareColor = 'var(--engagement-share-selected)';return <div className={`flex flex-col gap-1 ${isRail ? 'items-center' : ''}`}>
      <div className={isPanel ? `grid ${onShare ? 'grid-cols-4' : 'grid-cols-3'} gap-1` : isRail ? 'side-panel-navigation-list items-center' : 'flex items-center gap-0.5'} role="group" aria-label={`Engagement for ${projectTitle}`}>
        {ENGAGEMENT_KINDS.map((kind) => {const Icon = ICONS[kind];const labels = describeEngagement(kind);
          const isEngaged = engagement.isEngaged(kind);
          const isPending = engagement.isPending(kind);
          const total = engagement.count(kind);
          const tone = isEngaged ? '' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]';
          /*
           * Each action owns a permanent semantic outline: like is red, save is
           * yellow, and repost is green even before selection. Selection fills
           * that same outline rather than introducing a different colour. Paint
           * is written directly onto the glyph because the global control theme
           * intentionally repaints ordinary inheriting icons.
           */
          const semanticColor = SELECTED_COLORS[kind];
          const engagedColor = isEngaged ? semanticColor : undefined;
          const paint = isEngaged ? {
            fill: semanticColor,
            stroke: semanticColor
          } : {
            fill: 'none',
            stroke: semanticColor
          };
          if (isPanel) {
            /*
             * A two-column grid rather than two stacked rows: the glyph and its total
             * sit side by side, and the word occupies the glyph's column on the row
             * beneath. That is what centres the word on the GLYPH — centring it under
             * the pair instead would push it off the glyph by half the number's width,
             * and by a different amount for every count.
             */
            return <button key={kind} type="button" data-semantic-action="engagement" onClick={() => engagement.toggle(kind)} disabled={isPending || engagement.isResolving || engagement.resolveError !== null} aria-pressed={isEngaged} aria-label={`${isEngaged ? labels.undo : labels.action}: ${projectTitle}`} data-keep-color={isEngaged ? '' : undefined} style={isEngaged ? {
              color: engagedColor
            } : undefined} className={`flex flex-col items-center rounded-[8px] px-1 py-2 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${tone}`}>
                <span className="grid grid-cols-[auto_auto] items-center justify-items-center gap-x-1.5 gap-y-1.5">
                  <InterfaceIcon icon={Icon} size="lg" weight="regular" keepColor fill={paint.fill} stroke={paint.stroke} />
                  {/* Only a real total. */}
                  {total !== null && <span className="text-[13px] font-medium tabular-nums">{total}</span>}
                  {/* The word, not just the colour, reports the state. */}
                  <span className="col-start-1 row-start-2 text-[12px] leading-none">{isEngaged ? labels.state : labels.action}</span>
                </span>
              </button>;
          }
          /*
           * Icon only. The word still reaches assistive tech through the label and a
           * sighted viewer through the tooltip, and the FILL — not colour alone —
           * continues to report the state, so nothing is lost by dropping the text.
           */
          return <button key={kind} type="button" data-semantic-action="engagement" onClick={() => engagement.toggle(kind)} disabled={isPending || engagement.isResolving || engagement.resolveError !== null} aria-pressed={isEngaged} title={isEngaged ? labels.state : labels.action} aria-label={`${isEngaged ? labels.undo : labels.action}: ${projectTitle}`} data-keep-color={isEngaged ? '' : undefined} style={isEngaged ? {
            color: engagedColor
          } : undefined} className={`side-panel-compact-control flex items-center justify-center gap-1 rounded-[8px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50 ${isRail ? 'h-10 w-10' : showCounts ? 'min-w-8 px-1' : 'w-8'} ${tone}`}>
              <InterfaceIcon icon={Icon} size={interfaceIconSize} weight="regular" keepColor fill={paint.fill} stroke={paint.stroke} />
              {showCounts && total !== null && <span className="text-[11px] font-semibold tabular-nums">{new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(total)}</span>}
            </button>;
        })}
        {onShare && (isPanel ? <button type="button" data-semantic-action="share" onClick={onShare} aria-pressed={isShared} aria-label={`${isShared ? 'Shared' : 'Share'}: ${projectTitle}`} data-keep-color="" style={{
          color: shareColor
        }} className="flex flex-col items-center rounded-[8px] px-1 py-2 transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <span className="grid items-center justify-items-center gap-y-1.5">
              <InterfaceIcon icon={SendIcon} size="lg" weight="regular" keepColor fill={isShared ? shareColor : 'none'} stroke={shareColor} />
              <span className="text-[12px] leading-none">{isShared ? 'Shared' : 'Share'}</span>
            </span>
          </button> : <button type="button" data-semantic-action="share" onClick={onShare} aria-pressed={isShared} title={isShared ? 'Shared' : 'Share'} aria-label={`${isShared ? 'Shared' : 'Share'}: ${projectTitle}`} data-keep-color="" style={{
          color: shareColor
        }} className={`side-panel-compact-control flex items-center justify-center rounded-[8px] transition-colors duration-150 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${isRail ? 'h-10 w-10' : 'w-8'}`}>
            <InterfaceIcon icon={SendIcon} size={interfaceIconSize} weight="regular" keepColor fill={isShared ? shareColor : 'none'} stroke={shareColor} />
          </button>)}
      </div>

      {/* A failed read: the controls are held rather than claiming "not liked". */}
      {!isRail && engagement.resolveError && <p role="status" className="text-[11px] leading-snug text-[var(--text-secondary)]">
          {engagement.resolveError}
          <button type="button" onClick={engagement.retryResolve} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>
        </p>}

      {/* A failed mutation: already rolled back, with the same attempt offered. */}
      {!isRail && engagement.failure && <p role="alert" className="text-[11px] leading-snug text-[var(--text-primary)]">
          {engagement.failure.message}
          {engagement.failure.retry && <button type="button" onClick={engagement.failure.retry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>}
          <button type="button" onClick={engagement.dismissFailure} className="ml-1.5 font-semibold text-[var(--text-secondary)] underline focus:outline-none">Dismiss</button>
        </p>}
    </div>;
}
