import type { MediaKind, ProjectCoverFrame } from '../../types/domain';
export type CoverThumbnailInput = { kind: MediaKind; sourceUrl: string; posterUrl?: string; pageNumber?: number; frame?: ProjectCoverFrame; aspectRatio?: number };
export type CoverThumbnailVariant = { size: 200 | 400 | 800; width: number; height: number; blob: Blob };
export type DecodedCoverSource = { source: CanvasImageSource; width: number; height: number; dispose?: () => void | Promise<void> };
export type CoverThumbnailRuntime = {
  loadImage: (url: string) => Promise<DecodedCoverSource>;
  renderPdfPage: (url: string, pageNumber: number, maxLongEdge: number) => Promise<DecodedCoverSource>;
  loadVideoFrame: (url: string) => Promise<DecodedCoverSource>;
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
  encodeWebp: (canvas: HTMLCanvasElement) => Promise<Blob>;
};
export const COVER_THUMBNAIL_SIZES: readonly [200, 400, 800];
export function coverThumbnailGeometry(width: number, height: number, input?: Partial<CoverThumbnailInput>): { ratio: number; contain: boolean; source: { x: number; y: number; width: number; height: number } };
export function renderCoverVariants(input: CoverThumbnailInput, runtime: CoverThumbnailRuntime): Promise<CoverThumbnailVariant[]>;

export function renderCoverAssets(input: CoverThumbnailInput, runtime: CoverThumbnailRuntime): Promise<{ variants: CoverThumbnailVariant[]; social: { width: 1200; height: 630; blob: Blob } }>;
