# Image repositioning

`src/components/media/ImageRepositioner.tsx` is a responsive, local crop editor. It uses the existing Portalink controls, colors and focus styles. `ImageRepositionDialog.tsx` presents it in the existing modal/focus stack.

```tsx
<ImageRepositioner
  source={originalFile}
  alt="Project cover"
  aspectRatio={16 / 9}
  initialPosition={savedPosition}
  outputWidth={1920}
  onSave={async ({ crop, position, blob, canvas, sourceSize, outputSize }) => {
    // Persist crop/position with the original asset, or upload the rendered blob.
    await saveCover({ crop, position, blob });
  }}
/>
```

- Use `shape="square"` for Portalink's squircle avatar preview, or `shape="circle"` for a circular preview. Both force a 1:1 crop; rectangles accept `aspectRatio` (default 16:9).
- `source` accepts a File/Blob or an image URL. Remote URLs must permit anonymous CORS for canvas export. The editor reports load/export failures and leaves the draft editable.
- Reposition enters editing. Drag or arrow keys pan; Shift increases the arrow step. A 100–300% slider zooms about the center; the wheel zooms about the pointer. Image bounds always cover the viewport.
- Cancel restores the last committed position without calling `onSave`. Save exports first, then awaits `onSave`; a rejected callback keeps the draft editable. `onEditingChange` reports user toggles. `startEditing` opens directly in edit mode.
- `initialPosition`/`initialCrop` initialize a source. Replace the source or remount with a new key when switching independently saved crops of the same asset.
- `disabled` disables editing. `onSavingChange` lets a host guard navigation during Save; the dialog blocks X, backdrop, Escape and Cancel while saving. Source replacement/unmount invalidates pending exports. Once the caller's `onSave` begins, the caller owns cancellation of any upload it starts.

## Crop metadata and CSS

`crop: { x, y, width, height, zoom }` describes the crop rectangle in the **original image's coordinates**, normalized to 0–1. `x` and `y` are its top-left corner; width and height are fractions of the source dimensions. Zoom is 1–3 relative to the minimum size that covers the viewport. For example, multiply `crop.x` by `sourceSize.width` to get a source-pixel coordinate.

`position: { x, y, zoom }` is different: x/y represent CSS object-position fractions, where 0 is the leading edge and 1 the trailing edge. Do not pass crop.x/y directly to object-position. Use `positionFromCrop(crop)` or the returned `position`; reopen using the same image and aspect ratio.

```tsx
import { imagePositionStyle } from '../utils/imageCrop';

<div style={{ aspectRatio: 16 / 9, overflow: 'hidden' }}>
  <img src={originalUrl} alt="Project cover"
    style={{ width: '100%', height: '100%', objectFit: 'cover',
      ...imagePositionStyle(position) }} />
</div>
```

The helper uses matching `objectPosition`, `transform: scale(zoom)` and `transformOrigin`. Keep the wrapper's aspect ratio equal to the saved crop ratio so CSS and exported pixels match.

## Rendered output

Save returns both `blob` and `canvas`, plus source/output pixel sizes. `mimeType` accepts WebP (default), PNG or JPEG. `outputWidth` defaults to at most 2048 source pixels; export avoids upscaling and caps either axis at 4096. The actual Blob MIME type is authoritative because browser format support can vary. JPEG fills transparent pixels with white. `exportCircle` optionally clips the bitmap to a circle; the normal square export is reusable under CSS avatar masks.

```ts
const file = new File([result.blob], 'cover.webp', { type: result.blob.type });
// Supply file to the application's existing validated storage/upload service.
```

Canvas produces a still image, including when the source is an animated GIF. The editor displays a notice for GIF files. File selection alone does not crop or replace an animation.

## Product integration and persistence

- Profile onboarding/editing: **Reposition** in AvatarPicker creates a cropped pending file (up to 512px wide). The enclosing profile Save uploads it through the existing avatar service. The original file/URL and crop remain available while editing; later sessions begin from the persisted cropped avatar, since full original avatars are not stored separately.
- Publishing: **Reposition cover** in MediaPicker records position, normalized crop and 16:9 aspect ratio in the cover attachment's existing `metadata.coverFrame`. The original project asset is retained for full viewing. The shared editor also returns a rendered Blob/Canvas to callers that need a separate thumbnail upload.
- Published project editing: **Reposition cover** updates local attachment edits. The enclosing Save passes them through `update_project`; migration `202609060003_project_cover_reposition.sql` validates and saves the frame atomically with existing edits, preserving unrelated metadata and source-file references. Cancel never writes the draft to the backend.
- Newly cropped covers use their saved aspect ratio wherever `getProjectAspectRatio` is used. Legacy covers without a crop ratio retain their existing aspect behavior and object-position semantics.

## Validation

```powershell
node --test tests/image-crop.test.mjs tests/image-repositioner.test.mjs
$env:PGLITE_MODULE_PATH = 'absolute/path/to/@electric-sql/pglite/dist/index.js'
node scripts/verify-cover-crop-database.mjs
npm run typecheck
npm run build
```

The automated tests cover geometry, CSS/export equivalence, canvas failures, Save/Cancel and stale exports. Database checks execute the actual migration in an isolated PostgreSQL-compatible engine with synthetic accounts and row-level policies. They do not use production records. These checks do not substitute for device/browser visual testing.
