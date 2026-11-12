export type MultipartSpec = { version: 1; sizeBytes: number; partBytes: number; partCount: number };
export const PART_BYTES: number;
export const MANIFEST_SUFFIX: string;
export function partPath(manifestPath: string, index: number): string;
export function multipartSpec(sizeBytes: number): MultipartSpec;
export function readMultipartSpec(value: unknown): MultipartSpec | undefined;
export function mediaResponse(request: Request, file: MultipartSpec & {
  urls: string[];
  fileName: string;
  mimeType: string;
}, fetchPart?: typeof fetch): Promise<Response>;
