/** User-agent hints describe a browser/OS, never prove a physical device identity. */
export function sessionDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser and device';
  const ua = userAgent.slice(0, 512);
  const os = /iPad/i.test(ua) ? 'iPad' : /iPhone/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Macintosh|Mac OS X/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'unknown device';
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'Edge' : /OPR\/|Opera/i.test(ua) ? 'Opera' : /Firefox\/|FxiOS\//i.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : 'Unknown browser';
  return `${browser} on ${os}`;
}
