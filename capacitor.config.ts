import type { CapacitorConfig } from '@capacitor/cli';

// The iOS app loads the hosted Portalink site so Auth callbacks, share links,
// the Sites worker API and the media service worker keep their existing origin.
// CAP_SERVER_URL points a development build at a live-reload dev server instead.
const PUBLIC_ORIGIN = 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const devServerUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.portalinknetworks.app',
  appName: 'Portalink',
  webDir: 'native/shell',
  server: {
    url: devServerUrl || PUBLIC_ORIGIN,
    cleartext: devServerUrl?.startsWith('http://') ?? false,
    // Shown from the bundled webDir when the remote page fails to load (e.g. offline launch).
    errorPath: 'index.html',
  },
  ios: {
    contentInset: 'never',
    // App-bound domains (Info.plist WKAppBoundDomains) enable service workers in WKWebView.
    limitsNavigationsToAppBoundDomains: !devServerUrl,
  },
};

export default config;
