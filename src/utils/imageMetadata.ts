export type ImageDimensions = {
  widthPixels: number;
  heightPixels: number;
};

function validDimensions(width: number, height: number): ImageDimensions | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    widthPixels: Math.round(width),
    heightPixels: Math.round(height)
  };
}

/** Reads only intrinsic geometry; the original file is never resampled. */
export async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  if (!file.type.startsWith('image/')) {
    return null;
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image'
      });
      const dimensions = validDimensions(bitmap.width, bitmap.height);
      bitmap.close();
      if (dimensions) {
        return dimensions;
      }
    } catch {
      // SVG and a few browser-specific formats use the image-element fallback.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<ImageDimensions | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(validDimensions(image.naturalWidth, image.naturalHeight));
      image.onerror = () => resolve(null);
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function imageDimensionsLabel(dimensions?: ImageDimensions | null): string | null {
  return dimensions ? `${dimensions.widthPixels} × ${dimensions.heightPixels} px` : null;
}

export function imageResolutionNotice(
  dimensions: ImageDimensions | null | undefined,
  use: 'artwork' | 'avatar',
  isVector = false
): string | null {
  if (!dimensions || isVector) {
    return null;
  }
  const shortest = Math.min(dimensions.widthPixels, dimensions.heightPixels);
  const longest = Math.max(dimensions.widthPixels, dimensions.heightPixels);
  if (use === 'avatar') {
    return shortest < 512 ? 'For a sharper profile picture on high-density displays, use at least 512 × 512 px.' : null;
  }
  return longest < 1600 ? 'This may look soft in a large or high-density viewer. For covers, use at least 1600 px on the longest edge.' : null;
}
