import React from 'react';

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
  ...imageProps
}: ResponsiveImageProps) {
  const image = <img
    {...imageProps}
    data-responsive-image=""
    src={src}
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
        srcSet={source.srcSet}
        type={source.type}
        media={source.media}
        sizes={source.sizes ?? imageProps.sizes}
      />)}
      {image}
    </picture>;
}
