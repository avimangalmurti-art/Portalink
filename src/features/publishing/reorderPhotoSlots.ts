/** Reorder photos within their existing slots, keeping other files in place. */
export function reorderPhotoSlots<T extends { id: string }>(
  items: T[], isPhoto: (item: T) => boolean, movingId: string, targetId: string,
): T[] {
  const photos = items.filter(isPhoto);
  const from = photos.findIndex(photo => photo.id === movingId);
  const to = photos.findIndex(photo => photo.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;

  const [movingPhoto] = photos.splice(from, 1);
  photos.splice(to, 0, movingPhoto);
  let photoIndex = 0;
  return items.map(item => isPhoto(item) ? photos[photoIndex++] : item);
}
