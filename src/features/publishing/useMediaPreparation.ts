import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { canBeCover, canPreviewLocally, detectAsset, initialProcessingState } from './assetTypes';
import type { MediaPreparationState, MediaRejectionCode, PreparedMedia, UploadCapability } from '../../types/publishing';
import { readImageDimensions } from '../../utils/imageMetadata';
import type { ProjectCoverFrame } from '../../types/domain';

/**
 * Universal local asset preparation. NOTHING IS UPLOADED.
 *
 * A project is an ordered collection of assets of any family, so this hook is
 * deliberately format-agnostic: it detects what each file is, validates it
 * against that family's limit, keeps the ordering and cover the creator
 * chooses, and owns every object URL it creates. It reports the upload
 * capability from `MediaService` rather than assuming one, so a real
 * implementation adds uploading/progress/retry without rewriting this UI.
 */
const MAX_ASSETS = 105;

function rejectionMessage(code: MediaRejectionCode, detail: string): string {
  switch (code) {
    case 'too_large':
      return `${detail} is too large for its format.`;
    case 'too_many':
      return `A project can hold up to ${detail} files.`;
    case 'unsupported_type':
      return `${detail} could not be identified.`;
    default:
      return 'That file could not be read. Choose another.';
  }
}
function reindex(items: PreparedMedia[]): PreparedMedia[] {
  const ordered = items.map((item, index) => ({
    ...item,
    order: index
  }));
  // A project always has a cover if anything in it can be one.
  if (ordered.some((item) => item.isCover && canBeCover(item.family, item.capability))) {
    return ordered.map((item) => ({
      ...item,
      isCover: item.isCover && canBeCover(item.family, item.capability)
    }));
  }
  const suggested = ordered.find((item) => canBeCover(item.family, item.capability));
  return ordered.map((item) => ({
    ...item,
    isCover: item.id === suggested?.id
  }));
}
export function useMediaPreparation() {
  const {
    media: mediaService
  } = useServices();
  const [items, setItems] = useState<PreparedMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [capability, setCapability] = useState<UploadCapability | null>(null);
  // Ownership can be handed to a published project, which keeps its preview
  // alive; anything still owned here is revoked on unmount.
  const ownedUrlsRef = useRef<string[]>([]);
  const hasReleasedRef = useRef(false);
  useEffect(() => {
    let isCurrent = true;
    mediaService.getUploadCapability().then((next) => {
      if (isCurrent) {
        setCapability(next);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [mediaService]);
  useEffect(() => () => {
    if (hasReleasedRef.current) {
      return;
    }
    ownedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    ownedUrlsRef.current = [];
  }, []);
  const revoke = useCallback((url: string | null) => {
    if (!url) {
      return;
    }
    URL.revokeObjectURL(url);
    ownedUrlsRef.current = ownedUrlsRef.current.filter((owned) => owned !== url);
  }, []);
  const select = useCallback((files: FileList | File[] | null, replaceId?: string) => {
    const chosen = files ? Array.from(files) : [];
    if (chosen.length === 0) {
      return;
    }
    setIsSelecting(true);
    setError(null);
    const room = replaceId ? 1 : MAX_ASSETS - items.length;
    if (chosen.length > room) {
      setError(rejectionMessage('too_many', String(MAX_ASSETS)));
      setIsSelecting(false);
      return;
    }
    const candidates = chosen.map((file) => ({
      file,
      detected: detectAsset(file)
    }));
    const preparedUrls: string[] = [];
    void Promise.all(candidates.map(async ({ file, detected }): Promise<PreparedMedia> => {
        const previewUrl = canPreviewLocally(detected.family, detected.capability) ? URL.createObjectURL(file) : null;
        if (previewUrl) {
          ownedUrlsRef.current.push(previewUrl);
          preparedUrls.push(previewUrl);
        }
        const dimensions = detected.family === 'image' ? await readImageDimensions(file) : null;
        return {
          id: `asset-${crypto.randomUUID()}`,
          file,
          fileName: file.name,
          displayTitle: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
          family: detected.family,
          typeLabel: detected.typeLabel,
          capability: detected.capability,
          processingState: initialProcessingState(detected.capability),
          order: 0,
          isCover: false,
          previewUrl,
          metadata: dimensions ?? undefined
        };
      })).then((prepared) => {
      setItems((current) => {
        if (!replaceId) {
          return reindex([...current, ...prepared]);
        }
        return reindex(current.map((item) => {
          if (item.id !== replaceId) {
            return item;
          }
          revoke(item.previewUrl);
          // Replacing keeps the slot and the cover role it held.
          return {
            ...prepared[0],
            isCover: item.isCover
          };
        }));
      });
    }).catch(() => {
        preparedUrls.forEach(revoke);
        setError(rejectionMessage('unreadable', ''));
      }).finally(() => {
        setIsSelecting(false);
    });
  }, [items.length, revoke]);
  const remove = useCallback((mediaId: string) => {
    setError(null);
    setItems((current) => reindex(current.filter((item) => {
      if (item.id !== mediaId) {
        return true;
      }
      revoke(item.previewUrl);
      return false;
    })));
  }, [revoke]);
  const clear = useCallback(() => {
    setError(null);
    setItems((current) => {
      current.forEach((item) => revoke(item.previewUrl));
      return [];
    });
  }, [revoke]);
  /** Presentation order is the order visitors will experience the work in. */
  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setItems((current) => {
      if (toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return reindex(next);
    });
  }, []);
  const setCover = useCallback((mediaId: string) => {
    setItems((current) => {
      if (current.every((item) => item.isCover === (item.id === mediaId))) {
        return current;
      }
      return reindex(current.map((item) => ({
        ...item,
        isCover: item.id === mediaId
      })));
    });
  }, []);
  const setPageCount = useCallback((mediaId: string, pageCount: number, size?: { widthPixels: number; heightPixels: number }) => {
    if (!Number.isInteger(pageCount) || pageCount < 1) return;
    setItems((current) => current.map((item) => item.id !== mediaId || (item.metadata?.pageCount === pageCount && (!size || item.metadata?.widthPixels === size.widthPixels && item.metadata.heightPixels === size.heightPixels)) ? item : {
      ...item, metadata: { ...item.metadata, pageCount, ...size },
    }));
  }, []);
  const setCoverPage = useCallback((mediaId: string, pageNumber: number, pageCount?: number, frame?: ProjectCoverFrame) => {
    const safePageCount = pageCount && Number.isInteger(pageCount) && pageCount > 0 ? pageCount : undefined;
    const safePageNumber = Math.max(1, Math.min(Math.round(pageNumber), safePageCount ?? Number.MAX_SAFE_INTEGER));
    setItems((current) => {
      const target = current.find((item) => item.id === mediaId);
      if (!target) {
        return current;
      }
      const nextPageCount = safePageCount ?? target.metadata?.pageCount;
      const changedPage = (target.metadata?.coverPageNumber ?? 1) !== safePageNumber;
      const coverFrame = frame ?? (changedPage ? { x: .5, y: .5, zoom: 1, aspectRatio: target.metadata?.coverFrame?.aspectRatio ?? 4 / 3 } : target.metadata?.coverFrame);
      const isUnchanged = current.every((item) => item.isCover === (item.id === mediaId))
        && target.metadata?.coverPageNumber === safePageNumber
        && target.metadata?.pageCount === nextPageCount
        && target.metadata?.coverFrame === coverFrame;
      if (isUnchanged) {
        return current;
      }
      return reindex(current.map((item) => item.id === mediaId ? {
        ...item,
        isCover: true,
        metadata: {
          ...item.metadata,
          ...(nextPageCount ? { pageCount: nextPageCount } : {}),
          coverPageNumber: safePageNumber,
          coverFrame,
        },
      } : {
        ...item,
        isCover: false,
      }));
    });
  }, []);
  const setCoverFrame = useCallback((mediaId: string, coverFrame: ProjectCoverFrame, pageNumber?: number) => {
    setItems((current) => current.map((item) => item.id === mediaId && (pageNumber === undefined || (item.isCover && (item.metadata?.coverPageNumber ?? 1) === pageNumber)) ? {
      ...item,
      metadata: {
        ...item.metadata,
        coverFrame,
      },
    } : item));
  }, []);
  const rename = useCallback((mediaId: string, title: string) => {
    setItems((current) => current.map((item) => item.id === mediaId ? {
      ...item,
      displayTitle: title.trim() || item.fileName
    } : item));
  }, []);
  /**
   * Hands the previews to a published project. After this the hook stops
   * revoking them, so the work still renders for the rest of the session.
   */
  const releaseOwnership = useCallback(() => {
    hasReleasedRef.current = true;
    ownedUrlsRef.current = [];
  }, []);
  const restore = useCallback((saved: PreparedMedia[]) => {
    ownedUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    ownedUrlsRef.current = [];
    hasReleasedRef.current = false;
    setItems(saved.map(item => {
      const previewUrl = canPreviewLocally(item.family, item.capability) ? URL.createObjectURL(item.file) : null;
      if (previewUrl) ownedUrlsRef.current.push(previewUrl);
      return { ...item, previewUrl };
    }));
  }, []);
  const cover = useMemo(() => items.find((item) => item.isCover) ?? null, [items]);
  const state: MediaPreparationState = error ? 'invalid' : isSelecting ? 'selecting' : items.length === 0 ? 'empty' : capability?.isAvailable ? 'ready' : 'upload-unavailable';
  return {
    items,
    restore,
    cover,
    error,
    state,
    capability,
    isFull: items.length >= MAX_ASSETS,
    maxAssets: MAX_ASSETS,
    isComplete: items.length > 0,
    select,
    remove,
    clear,
    reorder,
    setCover,
    setPageCount,
    setCoverPage,
    setCoverFrame,
    rename,
    releaseOwnership
  };
}
export type MediaPreparation = ReturnType<typeof useMediaPreparation>;
