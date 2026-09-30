export function thumbnailSourceKey(input: {
  id: string;
  storagePath: string;
  pageNumber?: number;
  frame?: { x: number; y: number; zoom: number; aspectRatio?: number; crop?: { x: number; y: number; width: number; height: number; zoom: number } };
}): Promise<string>;
export function thumbnailContentHash(variants: ReadonlyArray<{ size: number; width: number; height: number; blob: Blob | Uint8Array }>): Promise<string>;
