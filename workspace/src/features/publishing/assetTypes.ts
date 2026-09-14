import type { AssetFamily, AssetPreviewCapability, AssetProcessingState } from '../../types/publishing';
import type { MediaKind } from '../../types/domain';

/**
 * One registry that decides what a file IS, so publishing never has to ask.
 *
 * A project is not defined by a format: a creator uploads whatever the work is
 * made of, and Portalink resolves each file's family, its human label, and how
 * far it can be presented. Adding a renderer later means adding rows here, not
 * redesigning publishing.
 *
 * `capability` is deliberately honest about the browser:
 *   native        — renders interactively as-is
 *   converted     — needs a processing service before it can be presented
 *   preview-only  — a still preview is possible; the work is not interactive
 *   source-only   — kept and offered as a file; nothing can render it
 * The original upload is always preserved regardless of capability.
 */

type FamilyDefinition = {
  label: string;
  /** Shown in the quiet family line under the drop area. */
  shortLabel: string;
};
export const assetFamilies: Record<AssetFamily, FamilyDefinition> = {
  image: {
    label: 'Image',
    shortLabel: 'Images'
  },
  document: {
    label: 'Document',
    shortLabel: 'Documents'
  },
  presentation: {
    label: 'Presentation',
    shortLabel: 'Documents'
  },
  data: {
    label: 'Data',
    shortLabel: 'Data'
  },
  video: {
    label: 'Video',
    shortLabel: 'Video'
  },
  audio: {
    label: 'Audio',
    shortLabel: 'Audio'
  },
  model: {
    label: '3D model',
    shortLabel: '3D'
  },
  cad: {
    label: 'CAD',
    shortLabel: '3D'
  },
  design: {
    label: 'Design file',
    shortLabel: 'Documents'
  },
  code: {
    label: 'Code',
    shortLabel: 'Code'
  },
  archive: {
    label: 'Archive',
    shortLabel: 'Data'
  }
};

/** The families named in the quiet supporting line, in reading order. */
export const familySummary = ['Images', 'Documents', 'Video', 'Audio', '3D', 'Data', 'Code'];
type ExtensionDefinition = {
  family: AssetFamily;
  /** Overrides the family label when the format itself is the useful word. */
  label?: string;
  capability: AssetPreviewCapability;
};
const EXTENSIONS: Record<string, ExtensionDefinition> = {
  // Images
  jpg: { family: 'image', capability: 'native' },
  jpeg: { family: 'image', capability: 'native' },
  png: { family: 'image', capability: 'native' },
  webp: { family: 'image', capability: 'native' },
  gif: { family: 'image', capability: 'native' },
  avif: { family: 'image', capability: 'native' },
  svg: { family: 'image', label: 'Vector image', capability: 'native' },
  heic: { family: 'image', capability: 'converted' },
  heif: { family: 'image', capability: 'converted' },
  tif: { family: 'image', capability: 'converted' },
  tiff: { family: 'image', capability: 'converted' },
  // Documents
  pdf: { family: 'document', label: 'PDF', capability: 'native' },
  doc: { family: 'document', capability: 'converted' },
  docx: { family: 'document', capability: 'converted' },
  odt: { family: 'document', capability: 'converted' },
  rtf: { family: 'document', capability: 'converted' },
  epub: { family: 'document', label: 'EPUB', capability: 'converted' },
  // Presentations
  ppt: { family: 'presentation', capability: 'converted' },
  pptx: { family: 'presentation', capability: 'converted' },
  odp: { family: 'presentation', capability: 'converted' },
  // Data
  csv: { family: 'data', label: 'Spreadsheet', capability: 'native' },
  tsv: { family: 'data', label: 'Spreadsheet', capability: 'native' },
  json: { family: 'data', label: 'Dataset', capability: 'native' },
  geojson: { family: 'data', label: 'Geospatial data', capability: 'native' },
  xls: { family: 'data', label: 'Spreadsheet', capability: 'converted' },
  xlsx: { family: 'data', label: 'Spreadsheet', capability: 'converted' },
  ods: { family: 'data', label: 'Spreadsheet', capability: 'converted' },
  ipynb: { family: 'data', label: 'Notebook', capability: 'converted' },
  // Video
  mp4: { family: 'video', capability: 'native' },
  webm: { family: 'video', capability: 'native' },
  mov: { family: 'video', capability: 'converted' },
  m4v: { family: 'video', capability: 'converted' },
  avi: { family: 'video', capability: 'converted' },
  // Audio
  mp3: { family: 'audio', capability: 'native' },
  wav: { family: 'audio', capability: 'native' },
  m4a: { family: 'audio', capability: 'native' },
  aac: { family: 'audio', capability: 'native' },
  ogg: { family: 'audio', capability: 'native' },
  opus: { family: 'audio', capability: 'converted' },
  flac: { family: 'audio', capability: 'converted' },
  // 3D
  glb: { family: 'model', capability: 'native' },
  gltf: { family: 'model', capability: 'native' },
  obj: { family: 'model', capability: 'converted' },
  stl: { family: 'model', capability: 'converted' },
  ply: { family: 'model', capability: 'converted' },
  fbx: { family: 'model', capability: 'converted' },
  dae: { family: 'model', capability: 'converted' },
  '3mf': { family: 'model', capability: 'converted' },
  // CAD / architecture
  ifc: { family: 'cad', label: 'IFC model', capability: 'converted' },
  dxf: { family: 'cad', label: 'CAD drawing', capability: 'converted' },
  dwg: { family: 'cad', label: 'CAD drawing', capability: 'source-only' },
  step: { family: 'cad', label: 'CAD model', capability: 'source-only' },
  stp: { family: 'cad', label: 'CAD model', capability: 'source-only' },
  iges: { family: 'cad', label: 'CAD model', capability: 'source-only' },
  igs: { family: 'cad', label: 'CAD model', capability: 'source-only' },
  // Design sources
  psd: { family: 'design', label: 'Photoshop file', capability: 'preview-only' },
  ai: { family: 'design', label: 'Illustrator file', capability: 'preview-only' },
  eps: { family: 'design', capability: 'preview-only' },
  sketch: { family: 'design', label: 'Sketch file', capability: 'source-only' },
  // Text and code
  txt: { family: 'code', label: 'Text', capability: 'native' },
  md: { family: 'code', label: 'Markdown', capability: 'native' },
  js: { family: 'code', capability: 'native' },
  jsx: { family: 'code', capability: 'native' },
  ts: { family: 'code', capability: 'native' },
  tsx: { family: 'code', capability: 'native' },
  py: { family: 'code', capability: 'native' },
  rb: { family: 'code', capability: 'native' },
  go: { family: 'code', capability: 'native' },
  rs: { family: 'code', capability: 'native' },
  swift: { family: 'code', capability: 'native' },
  java: { family: 'code', capability: 'native' },
  c: { family: 'code', capability: 'native' },
  cpp: { family: 'code', capability: 'native' },
  html: { family: 'code', capability: 'native' },
  css: { family: 'code', capability: 'native' },
  // Archives
  zip: { family: 'archive', capability: 'source-only' }
};

/** Grouped for the "Supported formats" disclosure, never the main modal. */
export const supportedFormatGroups: {
  title: string;
  formats: string;
}[] = [{
  title: 'Images',
  formats: 'JPG, PNG, WebP, GIF, AVIF, SVG, HEIC, TIFF'
}, {
  title: 'Documents',
  formats: 'PDF, DOC, DOCX, ODT, RTF, EPUB'
}, {
  title: 'Presentations',
  formats: 'PPT, PPTX, ODP'
}, {
  title: 'Data',
  formats: 'CSV, TSV, JSON, GeoJSON, XLS, XLSX, ODS, IPYNB'
}, {
  title: 'Video',
  formats: 'MP4, MOV, WebM, M4V, AVI'
}, {
  title: 'Audio',
  formats: 'MP3, WAV, AAC, M4A, FLAC, OGG, Opus'
}, {
  title: '3D',
  formats: 'GLB, GLTF, OBJ, STL, PLY, FBX, DAE, 3MF'
}, {
  title: 'CAD and architecture',
  formats: 'STEP, IGES, IFC, DXF, DWG'
}, {
  title: 'Design sources',
  formats: 'PSD, AI, EPS, Sketch'
}, {
  title: 'Text and code',
  formats: 'TXT, MD and common source files'
}, {
  title: 'Other',
  formats: 'ZIP and project source archives'
}];
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}
export type DetectedAsset = {
  family: AssetFamily;
  /** Human-readable type, e.g. "3D model", "PDF", "Spreadsheet". */
  typeLabel: string;
  capability: AssetPreviewCapability;
};

/**
 * What this file is. Extension leads because it is the most specific signal;
 * the MIME type is the fallback for files the browser labels but we do not
 * list. An unrecognised file is still accepted as a source attachment — the
 * work is preserved rather than refused.
 */
export function detectAsset(file: Pick<File, 'name' | 'type'>): DetectedAsset {
  const extension = fileExtension(file.name);
  const known = EXTENSIONS[extension];
  if (known) {
    return {
      family: known.family,
      typeLabel: known.label ?? assetFamilies[known.family].label,
      capability: known.capability
    };
  }
  const mime = file.type;
  if (mime.toLowerCase() === 'application/pdf') {
    return {
      family: 'document',
      typeLabel: 'PDF',
      capability: 'native'
    };
  }
  const fallbackFamily: AssetFamily = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('text/') ? 'code' : 'archive';
  return {
    family: fallbackFamily,
    typeLabel: extension ? extension.toUpperCase() : assetFamilies[fallbackFamily].label,
    capability: mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') ? 'native' : 'source-only'
  };
}

/** Video support depends on its codecs and the device, so let the player try. */
export function canPreviewLocally(family: AssetFamily, capability: AssetPreviewCapability): boolean {
  return family === 'video' || (capability === 'native' && (family === 'image' || family === 'audio' || family === 'model' || family === 'document'));
}

/**
 * The single place a file's RENDERER is decided.
 *
 * Nothing else in the product may infer this — not a category, not a region,
 * not a filename check inside a component. A family whose capability means the
 * browser cannot show it resolves to `unknown`. Video is an exception: the
 * player must try the actual stream, since a container alone cannot establish
 * whether this device can decode it. Conversion remains a separate job state.
 */
export function mediaKindFor(family: AssetFamily, capability: AssetPreviewCapability): MediaKind {
  switch (family) {
    case 'image':
      return capability === 'native' ? 'image' : 'unknown';
    case 'video':
      return 'video';
    case 'audio':
      return capability === 'native' ? 'audio' : 'unknown';
    case 'model':
      // GLB/GLTF render interactively; the rest await a conversion service.
      return capability === 'native' ? 'model3d' : 'unknown';
    case 'document':
      return capability === 'native' ? 'document' : 'unknown';
    default:
      return 'unknown';
  }
}

/** Repair legacy video classification when reading, without rewriting uploads. */
export function resolveStoredMediaKind(kind: MediaKind, fileName: string, mimeType: string): MediaKind {
  if (kind === 'unknown' && detectAsset({ name: fileName, type: mimeType }).family === 'video') return 'video';
  return kind;
}

/** Convenience for callers holding only a File. */
export function detectMediaKind(file: File): MediaKind {
  const detected = detectAsset(file);
  return mediaKindFor(detected.family, detected.capability);
}

/**
 * The truthful state of a locally prepared asset. No storage or processing
 * service exists, so nothing is ever `uploading` or `processing` — those states
 * belong to the future implementation and are declared, not simulated.
 */
export function initialProcessingState(capability: AssetPreviewCapability): AssetProcessingState {
  switch (capability) {
    case 'native':
      return 'ready';
    case 'converted':
      return 'conversion-required';
    case 'preview-only':
      return 'preview-limited';
    default:
      return 'preview-unavailable';
  }
}
export function processingLabel(state: AssetProcessingState): string | null {
  switch (state) {
    case 'conversion-required':
      return 'Needs conversion to preview';
    case 'preview-limited':
      return 'Still preview only';
    case 'preview-unavailable':
      return 'Kept as a source file';
    // Stored, with server-side work still outstanding. Kept distinct from the
    // transport failure below, because the repair is different.
    case 'processing':
      return 'Preview still being prepared';
    case 'processing-failed':
      return 'Stored, but its preview could not be prepared';
    case 'upload-failed':
      return 'Upload did not complete';
    default:
      return null;
  }
}

/** A cover has to be something that can actually be shown. */
export function canBeCover(family: AssetFamily, capability: AssetPreviewCapability): boolean {
  if (canPreviewLocally(family, capability)) {
    return family !== 'audio';
  }
  // A poster frame or page thumbnail can be generated for these later.
  return family === 'document' || family === 'video' || family === 'model' || family === 'presentation';
}
