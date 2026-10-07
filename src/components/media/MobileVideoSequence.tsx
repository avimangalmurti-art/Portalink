import React, { useLayoutEffect, useRef } from 'react';
import type { ProjectAttachment } from '../../types/domain';
import { MobileVideoFrame, type VideoCreator } from './MobileVideoFrame';

export type VideoSequenceEntry = { projectId: string; projectTitle: string; attachment: ProjectAttachment };
const videoSequenceId = (entry: VideoSequenceEntry) => `${entry.projectId}:${entry.attachment.id}`;

/** Native vertical scrolling through the portal's already accessible videos. */
export function MobileVideoSequence({ videos, activeId, creator, onSelect, renderVideo }: {
  videos: VideoSequenceEntry[];
  activeId: string;
  creator?: VideoCreator;
  onSelect: (video: VideoSequenceEntry) => void;
  renderVideo: (video: VideoSequenceEntry, active: boolean) => React.ReactNode;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const latest = useRef({ activeId, onSelect, videos });
  latest.current = { activeId, onSelect, videos };
  const ids = videos.map(videoSequenceId).join('|');
  const alignSelection = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const item = Array.from(surface.children).find(child => child.getAttribute('data-video-id') === latest.current.activeId) as HTMLElement | undefined;
    if (item) surface.scrollTop = item.offsetTop - (surface.clientHeight - item.offsetHeight) / 2;
  };
  useLayoutEffect(() => {
    // Scrolling already positioned this video. Do not snap back while a finger
    // is still moving; only file-strip/deep-link selections need repositioning.
    if (selectedRef.current === activeId) return;
    selectedRef.current = activeId;
    alignSelection();
  }, [activeId, ids]);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const resize = new ResizeObserver(alignSelection);
    resize.observe(surface);
    return () => {
      resize.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);
  const selectVisible = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const surface = surfaceRef.current;
      if (!surface) return;
      const center = surface.scrollTop + surface.clientHeight / 2;
      let closest: HTMLElement | null = null;
      let distance = Infinity;
      for (const child of Array.from(surface.children)) {
        const item = child as HTMLElement;
        const nextDistance = Math.abs(item.offsetTop + item.offsetHeight / 2 - center);
        if (nextDistance < distance) { closest = item; distance = nextDistance; }
      }
      const id = closest?.dataset.videoId;
      if (id && id !== selectedRef.current) {
        selectedRef.current = id;
        const entry = latest.current.videos.find(video => videoSequenceId(video) === id);
        if (entry) latest.current.onSelect(entry);
      }
    });
  };
  const activeIndex = videos.findIndex(video => videoSequenceId(video) === activeId);
  return <div ref={surfaceRef} className="mobile-video-sequence" aria-label="Videos" tabIndex={0} onScroll={selectVisible}>
    {videos.map((video, index) => <section key={videoSequenceId(video)} data-video-id={videoSequenceId(video)} aria-label={`${video.projectTitle}: ${video.attachment.displayName}`}
      style={{ '--video-aspect-ratio': video.attachment.metadata?.aspectRatio || (video.attachment.metadata?.widthPixels && video.attachment.metadata?.heightPixels ? video.attachment.metadata.widthPixels / video.attachment.metadata.heightPixels : 9 / 16) } as React.CSSProperties}>
      <MobileVideoFrame creator={creator} sourceTitle={video.projectTitle}>{Math.abs(index - activeIndex) <= 1
        ? renderVideo(video, index === activeIndex)
        : <div className="mobile-video-sequence-placeholder" aria-label={video.attachment.displayName} />}</MobileVideoFrame>
    </section>)}
  </div>;
}
