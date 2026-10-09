export const DOCUMENT_PAGE_SIZES: readonly number[];
export type PreparedPage = { number: number; variants: Array<{ storagePath: string; size: number; width: number; height: number }> };
export function prepareDocumentPages(input: { count: number; limit?: number; render(number: number, size: number): Promise<{ blob: Blob; width: number; height: number }>; upload(path: string, blob: Blob): Promise<void>; path(number: number, size: number, blob: Blob): Promise<string> }): Promise<{ pages: PreparedPage[]; failed: number[]; backfillFrom: number | null }>;

export function documentPageSlots<T extends {withinDocumentIndex: number; sourceUrl: string; index: number; attachmentId: string; storagePath: string; width: number; height: number; aspectRatio: number}>(available: T[], count: unknown, attachmentId: string): T[];
