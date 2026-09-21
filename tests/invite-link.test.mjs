import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const routes = {};
vm.runInNewContext(transpile(read('../src/app/routes.ts')), { exports: routes, require: () => ({ navigationDestinations: [] }) });

// Exercise the actual account-menu handler without sending a real invitation.
function invite({ profileHref, share, clipboardFails = false } = {}) {
  const source = read('../src/components/Sidebar.tsx');
  const handler = source.slice(source.indexOf('  async function inviteFriend()'), source.indexOf('  async function handleAuthAction()'));
  const exports = {}, copied = [], statuses = [];
  vm.runInNewContext(transpile(handler.replace('async function inviteFriend', 'export async function inviteFriend')), {
    exports, URL, DOMException, profileHref, buildPath: routes.buildPath,
    window: { location: { origin: 'https://portalink.example' } },
    navigator: { share, clipboard: { async writeText(value) { if (clipboardFails) throw Error('Unavailable'); copied.push(value); } } },
    setInviteStatus(value) { statuses.push(value); },
  });
  return { run: exports.inviteFriend, copied, statuses };
}

test('native invitations always share welcome, regardless of the sender or viewed profile', async () => {
  for (const profileHref of ['/p/sender', '/share/another-creator/c/portal/project?page=3', undefined]) {
    const payloads = [];
    const h = invite({ profileHref, share: async payload => payloads.push(payload) });
    await h.run();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].url, 'https://portalink.example/?welcome=1');
    assert.equal(payloads[0].text, 'Join me on the Portalink Network.');
    assert.deepEqual(h.copied, []);
  }
});

test('clipboard fallback copies the same invitation URL and only confirms successful copying', async () => {
  for (const share of [undefined, async () => { throw Error('Sharing unavailable'); }]) {
    const h = invite({ profileHref: '/p/sender', share }); await h.run();
    assert.deepEqual(h.copied, ['https://portalink.example/?welcome=1']);
    assert.deepEqual(h.statuses, ['copied']);
  }
  const denied = invite({ clipboardFails: true }); await denied.run();
  assert.deepEqual(denied.statuses, []);
});

test('cancelling native sharing does not copy or claim an invitation was sent', async () => {
  const h = invite({ share: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  await h.run(); assert.deepEqual(h.copied, []); assert.deepEqual(h.statuses, []);
});
