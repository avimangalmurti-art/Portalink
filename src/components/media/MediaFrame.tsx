import React from 'react';

/**
 * The surface every attachment renderer shares, so an image, a video, a model,
 * and a file card all sit in the same frame as the document and audio viewers.
 *
 * There is deliberately no header. The identity bar that used to sit here only
 * restated the project title the portal sidebar already shows, and the control it
 * carried now lives with the other authoring tools in that sidebar — so the frame
 * gives the work the whole area instead of spending 68px repeating a fact.
 */
export function MediaFrame({
  children,
  readerMediaState,


}: {children: React.ReactNode; readerMediaState?: 'error';}) {
  /*
   * Transparent, so the work sits directly on the page's own canvas. Painting
   * `--surface-canvas` here laid a lighter panel over the profile surface behind
   * it, which read as a grey overlay around every project.
   */
  return <div data-media-frame="" data-reader-media-state={readerMediaState} className="flex h-full min-h-0 w-full flex-col bg-transparent">
      <div data-media-frame-body="" className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>;
}
