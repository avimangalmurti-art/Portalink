import React from 'react';
import type { UserProfilePage } from '../../components/UserProfilePage';

/** Keep profile navigation stable while selected projects use the full canvas. */
export function MobileProfileWorkspace({ overview, children, view = 'projects', projectSelected = false }: {
  overview: React.ReactElement<React.ComponentProps<typeof UserProfilePage>>;
  children?: React.ReactElement;
  view?: 'portals' | 'projects';
  projectSelected?: boolean;
}) {
  // The nested viewer keeps one React position when the viewport changes.
  // UserProfilePage makes this frame visually transparent on WEB.
  return React.cloneElement(overview, { mobileContent: children, mobileContentView: view, mobileProjectSelected: projectSelected });
}
