export const PRIVACY_POLICY_PATH = '/privacy';
const UPDATED = 'November 27, 2026';
const CONTACT = 'avi@portalinknetworks.com';

const sections: Array<[string, string[]]> = [
  ['Who we are', [
    `Portalink is operated by Portalink Networks Inc. ("Portalink", "we", "us"). This policy explains what information Portalink collects through portalinknetworks.com and the Portalink iOS app, how we use it and the choices you have. Questions can be sent to <a href="mailto:${CONTACT}">${CONTACT}</a>.`,
  ]],
  ['Information you give us', [
    '<strong>Account information.</strong> Your email address, password (stored only as a secure hash by our authentication provider), name and portfolio address.',
    '<strong>Profile and portfolio content.</strong> Your profile details, avatar, portals, projects, project descriptions and the files you upload, such as images, PDFs, video and audio.',
    '<strong>Messages and interactions.</strong> Messages and attachments you send, message requests, comments, likes, saves and follows.',
    '<strong>Support.</strong> Anything you include when you contact us.',
  ]],
  ['Information collected automatically', [
    '<strong>Usage and reading activity.</strong> Which projects and pages are opened and how far they are read, so creators can see how their published work is reached. Viewer sessions are stored as one-way hashes and referrers are grouped into broad categories.',
    '<strong>Performance measurements.</strong> Anonymous loading timings, a viewport size range and connection type. These measurements do not include URLs or identities.',
    '<strong>Device storage.</strong> Your browser or app stores your sign-in session and preferences (such as theme, scroll position and zoom) on your device. We do not use advertising cookies.',
    '<strong>Server logs.</strong> Our hosting providers process technical information such as IP address and browser type to deliver and secure the service.',
  ]],
  ['How we use information', [
    'To create and secure your account, host and display your portfolio, deliver messages and notifications, show creators reading insights about their own work, send account emails (such as verification and password resets), prevent abuse and improve performance and reliability.',
    'We do not sell your personal information and we do not use it for third-party advertising.',
  ]],
  ['What other people can see', [
    'Content you publish, including your profile, public portals and projects, is visible to anyone with the link and may appear in search results and link previews. Messages are visible to the people in the conversation. Creators can see aggregate reading insights for their own projects. You control whether a project allows citation by AI tools in its settings.',
  ]],
  ['Service providers', [
    'We share information only with providers that run Portalink on our behalf: Supabase (authentication, database and file storage), our website hosting and edge infrastructure provider, and our transactional email provider. They may process data only to provide their services to us. We may also disclose information when required by law or to protect the safety of our users.',
  ]],
  ['Retention and deletion', [
    'We keep your information while your account is active. You can edit or delete your projects, files and messages you sent at any time. To delete your account, use the account deletion option in Settings where available, or email us from your account email address. When an account is deleted we remove your profile, projects and uploaded files. Shared conversations are preserved for the other participants with your messages removed and shown as from a Deleted User.',
  ]],
  ['Your rights', [
    'Depending on where you live, you may have the right to access, correct, export or delete your personal information, or to object to certain processing. Contact us to make a request and we will respond within the time required by law.',
  ]],
  ['Children', [
    'Portalink is not directed to children under 13, and we do not knowingly collect personal information from them. If you believe a child has provided us information, contact us and we will delete it.',
  ]],
  ['Security', [
    'We use encryption in transit, access controls and private storage for non-public files. No system is perfectly secure, so please use a strong, unique password.',
  ]],
  ['Changes', [
    'We will update this page when our practices change and revise the date below. Significant changes will be communicated in the app or by email.',
  ]],
];

export function privacyPolicyHtml(): string {
  const body = sections.map(([title, paragraphs]) => `<h2>${title}</h2>${paragraphs.map(p => `<p>${p}</p>`).join('')}`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Privacy Policy | Portalink</title><meta name="description" content="How Portalink collects, uses and protects your information."><link rel="icon" href="/favicon.ico"><style>:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}body{margin:0;background:Canvas;color:CanvasText}main{max-width:680px;margin:0 auto;padding:calc(32px + env(safe-area-inset-top)) 20px calc(48px + env(safe-area-inset-bottom));line-height:1.55}h1{font-size:2rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 8px}p{margin:0 0 12px}a{color:LinkText}.updated{opacity:.7;margin-bottom:24px}.home{display:inline-block;margin-bottom:24px;text-decoration:none}</style></head><body><main><a class="home" href="/">Portalink</a><h1>Privacy Policy</h1><p class="updated">Last updated ${UPDATED}</p>${body}</main></body></html>`;
}

export function privacyPolicyResponse(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== PRIVACY_POLICY_PATH && url.pathname !== `${PRIVACY_POLICY_PATH}/`) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  return new Response(request.method === 'HEAD' ? null : privacyPolicyHtml(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' },
  });
}
