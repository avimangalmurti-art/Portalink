import { useEffect, useRef, useState } from 'react';
import { signedProjectImageThumbnail } from '../../services/supabase/mediaUrlCache';
import { ResponsiveImage, type ResponsiveImageProps } from '../ui/ResponsiveImage';

const THUMBNAIL_SIZES = [200, 400, 800, 1600];
const RESIZE_SETTLE_MS = 180;
const nearCoverCallbacks = new WeakMap<Element, () => void>();
let nearCoverObserver: IntersectionObserver | undefined;

function observeNearCover(host: Element, onNear: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    onNear();
    return undefined;
  }
  nearCoverObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) nearCoverCallbacks.get(entry.target)?.();
    }
  }, { rootMargin: '160px 0px' });
  const observer = nearCoverObserver;
  nearCoverCallbacks.set(host, () => {
    observer.unobserve(host);
    nearCoverCallbacks.delete(host);
    onNear();
  });
  observer.observe(host);
  return () => {
    observer.unobserve(host);
    nearCoverCallbacks.delete(host);
  };
}

export function DesktopCatalogueCoverImage({
  path,
  zoom,
  src,
  onError,
  onLoad,
  ...imageProps
}: ResponsiveImageProps & { path: string; zoom: number }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [images, setImages] = useState<{ painted?: string; requested?: string }>({});
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let stopped = false;
    let largestRequested = 0;
    let resizeObserver: ResizeObserver | undefined;
    let resizeTimer: number | undefined;
    const requestThumbnail = () => {
      const longestEdge = Math.max(host.clientWidth, host.clientHeight);
      if (!longestEdge) return;
      const pixels = longestEdge * Math.min(window.devicePixelRatio || 1, 2) * zoom;
      const size = THUMBNAIL_SIZES.find(tier => tier >= pixels) ?? THUMBNAIL_SIZES[THUMBNAIL_SIZES.length - 1];
      // Keep a sharper image after the grid shrinks. Upgrade only after a
      // layout change settles so dragging a density slider does not churn URLs.
      if (size <= largestRequested) return;
      largestRequested = size;
      const stillNeeded = () => !stopped && size === largestRequested;
      void signedProjectImageThumbnail(path, size, stillNeeded).catch(() => null).then(url => {
        if (!stillNeeded()) return;
        setImages(current => {
          const requested = url ?? current.requested ?? (current.painted ? undefined : src);
          return requested && requested !== current.painted ? { ...current, requested } : current;
        });
      });
    };
    const stopObserving = observeNearCover(host, () => {
      requestThumbnail();
      if (typeof ResizeObserver === 'undefined') return;
      resizeObserver = new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(requestThumbnail, RESIZE_SETTLE_MS);
      });
      resizeObserver.observe(host);
    });
    return () => {
      stopped = true;
      stopObserving?.();
      resizeObserver?.disconnect();
      window.clearTimeout(resizeTimer);
    };
  }, [path, src, zoom]);

  return <span ref={hostRef} className="relative block h-full w-full">
    {[images.painted, images.requested].map(candidate => {
      if (!candidate) return null;
      const staging = Boolean(images.painted && candidate === images.requested);
      return <ResponsiveImage key={candidate} {...imageProps} src={candidate}
        aria-hidden={staging ? true : imageProps['aria-hidden']}
        loading={staging ? 'eager' : imageProps.loading}
        className={staging ? `${imageProps.className ?? ''} absolute inset-0 opacity-0` : imageProps.className}
        onLoad={event => {
          setImages(current => current.requested === candidate ? { painted: candidate } : current);
          onLoad?.(event);
        }}
        onError={event => {
          if (candidate === src && candidate === images.requested && !images.painted) onError?.(event);
          setImages(current => current.requested === candidate
            ? { painted: current.painted, requested: !current.painted && candidate !== src ? src : undefined }
            : current);
        }} />;
    })}
  </span>;
}
