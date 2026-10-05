import React, { useEffect, useState } from 'react';
import { ResponsiveImage, type ImagePriority } from '../ui/ResponsiveImage';

type CreatorAvatarProps = {
  name: string;
  avatar?: string | null;
  priority?: ImagePriority;
  className?: string;
  fallbackClassName?: string;
  shape?: 'squircle';
};

/**
 * The creator's canonical profile image, with initials only when the profile
 * genuinely has no usable image. The image is decorative wherever this appears
 * because the creator's name is rendered beside it.
 * Profiles currently store one avatar URL. Measure its display size without
 * inventing unsupported resolution variants or Storage transform URLs.
 */
export function CreatorAvatar({
  name,
  avatar,
  priority = false,
  className = 'h-9 w-9',
  fallbackClassName = 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-[var(--hairline)]'
}: CreatorAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [avatar]);
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
  const showsImage = Boolean(avatar) && !imageFailed;
  const shapeClassName = 'squircle';

  return <span aria-hidden="true" className={`relative flex shrink-0 overflow-hidden ${shapeClassName} ${className}`}>
      {showsImage ? <ResponsiveImage src={avatar ?? ''} decorative priority={priority} measureWidth width={128} height={128} onError={() => setImageFailed(true)} className="h-full w-full object-cover" /> : <span className={`flex h-full w-full items-center justify-center ${shapeClassName} text-[0.7em] font-semibold ring-1 ring-inset ${fallbackClassName}`}>{initials}</span>}
    </span>;
}
