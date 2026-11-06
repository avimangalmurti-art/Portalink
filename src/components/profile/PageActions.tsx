import { likesCapability } from '../../features/engagement/capabilities';
import React from 'react';
import { BookmarkIcon, EyeIcon, HeartIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';

/**
 * The response row shown beneath a page of content: like and bookmark.
 * Presentation only — no counts and
 * no behaviour yet, so it carries no hover, focus, or click state.
 *
 * One shared row for every viewer, so the set never diverges per surface.
 */
export function PageActions({
  showViews = false



}: { /** Documents that report viewing time prepend the eye. */showViews?: boolean;}) {
  return <div aria-hidden="true" className="mt-2 flex items-center gap-3.5 text-[var(--text-tertiary)]">
      {showViews && <InterfaceIcon icon={EyeIcon} />}
      {likesCapability&&<InterfaceIcon icon={HeartIcon} />}
      <InterfaceIcon icon={BookmarkIcon} />
    </div>;
}
