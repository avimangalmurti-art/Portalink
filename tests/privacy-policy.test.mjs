import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const { privacyPolicyResponse } = sourceModule('src/server/privacyPolicy.ts', {}, { Request, Response, Headers });
const { handleFromPath } = sourceModule('src/features/sharing/shareModel.ts');

test('serves the privacy policy as HTML at /privacy-policy', async () => {
  for (const path of ['/privacy-policy', '/privacy-policy/']) {
    const response = privacyPolicyResponse(new Request(`https://portalinknetworks.com${path}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    const html = await response.text();
    assert.match(html, /<h1>Privacy Policy<\/h1>/);
    assert.match(html, /mailto:avi@portalinknetworks\.com/);
  }
  const head = privacyPolicyResponse(new Request('https://portalinknetworks.com/privacy-policy', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(privacyPolicyResponse(new Request('https://portalinknetworks.com/privacy-policy', { method: 'POST' })).status, 405);
});

test('ignores other paths and never matches a portfolio handle', () => {
  for (const path of ['/', '/privacy', '/creator', '/privacy-policy/extra']) {
    assert.equal(privacyPolicyResponse(new Request(`https://portalinknetworks.com${path}`)), null);
  }
  assert.equal(handleFromPath('/privacy-policy'), null);
  assert.equal(handleFromPath('/privacy'), 'privacy');
});

test('worker routes /privacy-policy before share resolution and settings links to it', () => {
  const worker = readFileSync(new URL('../src/sites-worker.ts', import.meta.url), 'utf8');
  assert.ok(worker.indexOf('privacyPolicyResponse(request)') > 0);
  assert.ok(worker.indexOf('privacyPolicyResponse(request)') < worker.indexOf('isPublicSharePath(url.pathname)'));
  const settings = readFileSync(new URL('../src/components/ControlCenterPage.tsx', import.meta.url), 'utf8');
  assert.equal(settings.match(/window\.location\.assign\('\/privacy-policy'\)/g)?.length, 2, 'signed-in About and the mobile shared About screen both link the policy');
});
