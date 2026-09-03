const MB = 1024 * 1024;
const GB = 1024 * MB;
const TB = 1024 * GB;

/**
 * Size formatting shared by the publishing surfaces.
 *
 * Format-specific upload rules used to live here, keyed off the category's
 * presentation format. They are gone: a project is no longer defined by what
 * kind of file it holds, so what a file IS now comes from `assetTypes.ts`.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < MB) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < GB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  if (bytes < TB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  }
  return `${(bytes / TB).toFixed(1)} TB`;
}
