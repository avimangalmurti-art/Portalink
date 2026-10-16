/** Fetch only the existing anonymous export endpoint. A timeout also covers body reads. */
export async function downloadPortfolio(profileId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`/api/exports/portfolio/${encodeURIComponent(profileId)}`, {
    credentials: 'omit', cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error(response.status === 503
    ? 'Portfolio PDF is not available yet. Please try again later.'
    : 'The portfolio could not be downloaded. Check your connection and try again.');
  const blob = await response.blob();
  if (!/^application\/pdf(?:;|$)/i.test(blob.type) || !blob.size) {
    throw new Error('The download did not contain a PDF. Please try again.');
  }
  return blob;
}
