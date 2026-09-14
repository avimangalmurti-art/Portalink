/**
 * Project metadata rules. Same shape as the profile validators, so publishing
 * reuses one validation vocabulary rather than inventing a second.
 */
export const TITLE_MAX_LENGTH = 80;
export function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Give this project a title.';
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return `Use ${TITLE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}
