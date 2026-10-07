import React, { useLayoutEffect, useRef, useState } from 'react';
import { publicMediaUrl } from '../../features/media/publicMediaUrl';
import { markRumCover, rumViewToken } from '../../features/performance/rum';

export type ResponsiveImageSource = {
  srcSet: string;
  type?: string;
  media?: string;
  sizes?: string;
};

export type ImagePriority = boolean | 'viewport';

type CommonImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'decoding' | 'loading' | 'src'> & {
  src: string;
  /** Additional format or resolution candidates, ordered most preferred first. */
  sources?: ResponsiveImageSource[];
  /** Loads immediately and receives high network priority for above-fold art. */
  priority?: ImagePriority;
  loading?: 'eager' | 'lazy';
  /** Responsive grids can resize without viewport changes (density and sidebars). */
  measureWidth?: boolean;
  /** Only project artwork participates in first-cover timing, never avatars. */
  trackCoverPaint?: boolean;
};

type MeaningfulImageProps = CommonImageProps & {
  alt: string;
  decorative?: false;
};

type DecorativeImageProps = CommonImageProps & {
  alt?: '';
  decorative: true;
};

export type ResponsiveImageProps = MeaningfulImageProps | DecorativeImageProps;

/**
 * One delivery contract for bitmap artwork.
 *
 * It keeps native aspect metadata on the image, lets the browser choose from
 * supplied resolution/format candidates, decodes away from the main rendering
 * path, and makes decorative-vs-meaningful semantics explicit. The original
 * file is never redrawn through a canvas, so embedded colour profiles and image
 * detail remain the browser decoder's responsibility rather than being stripped.
 */
export function ResponsiveImage({
  src,
  sources = [],
  priority = false,
  loading = 'lazy',
  decorative = false,
  alt = '',
  draggable,
  measureWidth = false,
  fetchPriority,
  trackCoverPaint = false,
  ...imageProps
}: ResponsiveImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const viewTokenRef = useRef<number | null>(null);
  // The router observer starts a new view in the preceding layout effect;
  // reading during render would still see the old view for a cached grid.
  useLayoutEffect(() => { viewTokenRef.current = rumViewToken(); });
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  const [viewportPriority, setViewportPriority] = useState<boolean>();
  useLayoutEffect(() => {
    if ((!measureWidth && priority !== 'viewport') || !imageRef.current) return;
    const image = imageRef.current;
    const measure = () => {
      const bounds = image.getBoundingClientRect();
      const width = Math.ceil(bounds.width);
      if (measureWidth && width > 0) setMeasuredWidth(width);
      if (priority === 'viewport' && viewportPriority === undefined && bounds.width > 0 && bounds.height > 0) {
        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        setViewportPriority(bounds.bottom > 0 && bounds.top < viewportHeight && bounds.right > 0 && bounds.left < viewportWidth);
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(image);
    return () => observer?.disconnect();
  }, [measureWidth, priority, viewportPriority]);
  const sizes = measureWidth && measuredWidth ? `${measuredWidth}px` : imageProps.sizes;
  // Measure in the layout phase before exposing resolution candidates. Without
  // this, an eager image can start downloading the 800px file under a temporary
  // 100vw assumption even when its actual grid tile needs only 200px.
  const sourceReady = (!measureWidth || measuredWidth !== undefined) && (priority !== 'viewport' || viewportPriority !== undefined);
  const eager = priority === true || (priority === 'viewport' && viewportPriority === true);
  // React 18 warns for camel-case fetchPriority. The lowercase DOM attribute is
  // supported by browsers; keep its values typed and exclude the camel-case
  // React prop from the spread above.
  const priorityAttribute: { fetchpriority?: React.ImgHTMLAttributes<HTMLImageElement>['fetchPriority'] } = {
    fetchpriority: eager ? 'high' : fetchPriority,
  };
  const image = <img
    {...imageProps}
    ref={imageRef}
    sizes={sizes}
    data-responsive-image=""
    src={sourceReady ? publicMediaUrl(src) : undefined}
    srcSet={sourceReady ? imageProps.srcSet : undefined}
    alt={decorative ? '' : alt}
    aria-hidden={decorative ? true : imageProps['aria-hidden']}
    loading={eager ? 'eager' : loading}
    {...priorityAttribute}
    decoding="async"
    draggable={draggable ?? false}
    onLoad={event => {
      if (trackCoverPaint && event.currentTarget.naturalWidth > 0) markRumCover(viewTokenRef.current);
      imageProps.onLoad?.(event);
    }}
  />;

  if (sources.length === 0) {
    return image;
  }

  return <picture>
      {sources.map((source) => <source
        key={`${source.media ?? 'all'}-${source.type ?? 'auto'}-${source.srcSet}`}
        srcSet={sourceReady ? source.srcSet : undefined}
        type={source.type}
        media={source.media}
        sizes={source.sizes ?? sizes}
      />)}
      {image}
    </picture>;
}
