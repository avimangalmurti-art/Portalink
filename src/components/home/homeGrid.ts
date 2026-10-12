import { normalizeProjectGridColumns } from '../../utils/projectGridDensity';
/** Keep the existing 150px reading baseline; fallback is presentation-only. */
export function homeGridColumns(saved: number, contentWidth: number): number {
 const columns=normalizeProjectGridColumns(saved);
 return contentWidth>0 && columns*150+(columns-1)*4<=contentWidth ? columns : 2;
}
