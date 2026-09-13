import React from 'react';
import type { UserProfilePage } from '../../components/UserProfilePage';

/** Keep the existing profile header around mobile drill-down destinations. */
export function MobileProfileWorkspace({ overview, children, view = 'projects' }: {
  overview: React.ReactElement<React.ComponentProps<typeof UserProfilePage>>;
  children?: React.ReactElement;
  view?: 'portals' | 'projects';
}) {
  // The nested viewer keeps one React position when the viewport changes.
  // UserProfilePage makes this frame visually transparent on WEB.
  return React.cloneElement(overview, { mobileContent: children, mobileContentView: view });
}
