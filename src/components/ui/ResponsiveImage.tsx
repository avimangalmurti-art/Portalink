import React, { useLayoutEffect, useRef, useState } from 'react';

export type ResponsiveImageSource = {
  srcSet: string;
  type?: string;
  media?: string;
  sizes?: string;
};

type CommonImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'decoding' | 'loading' | 'src'> & {
  src: string;
  /** Additional format or resolution candidates, ordered most preferred first. */
  sources?: ResponsiveImageSource[];
  /** Loads immediately and receives high network priority for above-fold art. */
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  /** Responsive grids can resize without viewport changes (density and sidebars). */
  measureWidth?: boolean;
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
  ...imageProps
}: ResponsiveImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>();
  useLayoutEffect(() => {
    if (!measureWidth || !imageRef.current) return;
    const image = imageRef.current;
    const measure = () => { const width = Math.ceil(image.getBoundingClientRect().width); if (width > 0) setMeasuredWidth(width); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(image);
    return () => observer?.disconnect();
  }, [measureWidth]);
  const sizes = measureWidth && measuredWidth ? `${measuredWidth}px` : imageProps.sizes;
  // Measure in the layout phase before exposing resolution candidates. Without
  // this, an eager image can start downloading the 800px file under a temporary
  // 100vw assumption even when its actual grid tile needs only 200px.
  const sourceReady = !measureWidth || measuredWidth !== undefined;
  const image = <img
    {...imageProps}
    ref={imageRef}
    sizes={sizes}
    data-responsive-image=""
    src={sourceReady ? src : undefined}
    srcSet={sourceReady ? imageProps.srcSet : undefined}
    alt={decorative ? '' : alt}
    aria-hidden={decorative ? true : imageProps['aria-hidden']}
    loading={priority ? 'eager' : loading}
    fetchPriority={priority ? 'high' : imageProps.fetchPriority}
    decoding="async"
    draggable={draggable ?? false}
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
