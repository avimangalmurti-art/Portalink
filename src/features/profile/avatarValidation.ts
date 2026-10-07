import type { AvatarRejectionCode } from '../../types/profile';

const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
export const AVATAR_REJECTIONS: Record<AvatarRejectionCode, string> = {
  unsupported_type: 'Choose a PNG, JPEG, WebP, or GIF image.',
  too_large: 'Choose an image under 4 MB.',
  unreadable: 'That file could not be read. Choose another.'
};

/** Validate the original file before any crop can change its type or size. */
export function validateAvatarFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) return AVATAR_REJECTIONS.unsupported_type;
  if (file.size > MAX_AVATAR_BYTES) return AVATAR_REJECTIONS.too_large;
  return null;
}
