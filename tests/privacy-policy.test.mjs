import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { privacyPolicyResponse } = sourceModule('src/server/privacyPolicy.ts', {}, { Request, Response, Headers });
const { handleFromPath, RESERVED_HANDLES } = sourceModule('src/features/sharing/shareModel.ts');

test('serves the privacy policy as HTML at /privacy', async () => {
  for (const path of ['/privacy', '/privacy/']) {
    const response = privacyPolicyResponse(new Request(`https://portalinknetworks.com${path}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    const html = await response.text();
    assert.match(html, /<h1>Privacy Policy<\/h1>/);
    assert.match(html, /mailto:avi@portalinknetworks\.com/);
  }
  const head = privacyPolicyResponse(new Request('https://portalinknetworks.com/privacy', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(privacyPolicyResponse(new Request('https://portalinknetworks.com/privacy', { method: 'POST' })).status, 405);
});

test('ignores other paths and keeps /privacy out of portfolio handles', () => {
  for (const path of ['/', '/privacy-policy', '/creator', '/privacy/extra']) {
    assert.equal(privacyPolicyResponse(new Request(`https://portalinknetworks.com${path}`)), null);
  }
  assert.ok(RESERVED_HANDLES.has('privacy'));
  assert.equal(handleFromPath('/privacy'), null);
});

test('worker routes /privacy before share resolution and settings links to it', () => {
  const worker = readFileSync(new URL('../src/sites-worker.ts', import.meta.url), 'utf8');
  assert.ok(worker.indexOf('privacyPolicyResponse(request)') > 0);
  assert.ok(worker.indexOf('privacyPolicyResponse(request)') < worker.indexOf('isPublicSharePath(url.pathname)'));
  const settings = readFileSync(new URL('../src/components/ControlCenterPage.tsx', import.meta.url), 'utf8');
  assert.match(settings, /window\.location\.assign\('\/privacy'\)/);
});
