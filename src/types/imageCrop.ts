/** Source-relative rectangle: x/y are its top-left; all four coordinates are 0–1. */
export type RelativeImageCrop = { x: number; y: number; width: number; height: number; zoom: number };
/** Object-position coordinates, distinct from a source-relative crop origin. */
export type ImagePosition = { x: number; y: number; zoom: number };
export type ImageSize = { width: number; height: number };
export type ImageCropResult = {
  crop: RelativeImageCrop;
  position: ImagePosition;
  blob: Blob;
  canvas: HTMLCanvasElement;
  sourceSize: ImageSize;
  outputSize: ImageSize;
};
