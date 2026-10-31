import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const registration = sourceModule('src/features/auth/registration.ts', { '../profile/validation': validation, '../sharing/shareModel': shareModel });
const settings = sourceModule('src/features/sharing/sharedSettings.ts', { '../auth/registration': registration, './shareModel': shareModel });

test('public Settings survives handle/UUID reader reload and restores only the catalogue location', () => {
  for (const base of ['/portalite', '/share/11111111-1111-4111-8111-111111111111', '/portalite/c/art/work']) {
    const path = settings.sharedSettingsPath(base + '?view=projects&page=2&media=image-a&visitorPreview=1', '?section=account&security=1');
    const url = new URL(path, 'https://portalink.invalid');
    assert.equal(url.pathname, base);
    assert.equal(url.searchParams.get('settings'), '1');
    assert.equal(url.searchParams.get('section'), 'account');
    assert.equal(url.searchParams.get('security'), '1');
    assert.equal(url.searchParams.get('visitorPreview'), '1');
    const back = new URL(settings.sharedSettingsReturnPath(path), 'https://portalink.invalid');
    assert.equal(back.pathname, base);
    assert.equal(back.searchParams.get('view'), 'projects');
    assert.equal(back.searchParams.get('settings'), null);
    assert.equal(back.searchParams.get('section'), null);
    assert.equal(back.searchParams.get('security'), null);
    assert.equal(back.searchParams.get('visitorPreview'), '1');
  }
});

test('public Settings rejects platform, citation and external destinations and strips auth parameters', () => {
  for (const path of ['/settings', '/p/owner', '/studio', '/cite/item', '//evil.example/path', 'https://evil.example/portalite', 'javascript:alert(1)']) {
    assert.equal(settings.sharedSettingsPath(path, '?section=account'), undefined, path);
  }
  const path = settings.sharedSettingsPath('/portalite?code=secret&access_token=secret&via=friend', '?section=appearance&panel=system-grey&access_token=secret');
  assert.equal(path.includes('secret'), false);
  assert.equal(new URL(path, 'https://portalink.invalid').searchParams.get('panel'), 'system-grey');
  assert.equal(settings.sharedSettingsReturnPath('/portalite?section=account'), undefined);
  assert.equal(settings.sharedSettingsReturnPath('/settings?settings=1'), undefined);
  assert.equal(settings.sharedSettingsReturnPath('https://evil.example/portalite?settings=1'), undefined);
});
