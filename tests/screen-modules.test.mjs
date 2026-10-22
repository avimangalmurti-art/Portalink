import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.mjs';

function fixture() {
  const calls = [], imports = {};
  let failMessages = false;
  for (const [path, component] of [
    ['../components/MessagesPage', 'MessagesPage'], ['../features/studio/StudioPage', 'StudioPage'],
    ['../components/SearchBrowsePage', 'SearchBrowsePage'], ['../components/ControlCenterPage', 'ControlCenterPage'],
    ['../components/UserProfilePage', 'UserProfilePage'], ['../components/profile/ProfileCategoryPage', 'ProfileCategoryPage'],
    ['../features/profile/ProfileEditorDialog', 'ProfileEditorPage'], ['../visitor/VisitorProjectPage', 'VisitorProjectPage'],
  ]) imports[path] = { get [component]() { calls.push(component); if (component === 'MessagesPage' && failMessages) throw Error('Offline chunk'); return component; } };
  return { api: sourceModule('src/app/screenModules.ts', imports), calls, failMessages(value) { failMessages = value; } };
}

test('common screens download independently and failed messages cannot delay profile, Studio or settings', async () => {
  const f = fixture(); f.failMessages(true);
  const result = await f.api.warmCommonScreens();
  assert.deepEqual(f.calls, ['UserProfilePage','MessagesPage','StudioPage','ControlCenterPage']);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 3);
  assert.ok(!f.calls.includes('SearchBrowsePage'), 'spatial code is requested only with route intent');
  f.failMessages(false);
  await f.api.warmScreenForPath('/messages/thread');
  assert.equal(f.calls.filter(name => name === 'MessagesPage').length, 2, 'a failed prefetch is retryable');
});

test('canonical cold destinations request their screen code without fetching account data', async () => {
  for (const [path, expected] of [
    ['/p/creator/c/portal/project',['UserProfilePage','ProfileCategoryPage']],
    ['/studio',['StudioPage']], ['/saved',['StudioPage']], ['/settings',['ControlCenterPage']], ['/control-center',['ControlCenterPage']],
    ['/profile/edit',['ProfileEditorPage']], ['/search',['SearchBrowsePage']], ['/portalink/city',['SearchBrowsePage']],
    ['/',[]],
  ]) {
    const f = fixture(); await f.api.warmScreenForPath(path); assert.deepEqual(f.calls, expected, path);
  }
});

test('code warmup and the actual lazy screen share one in-flight module read', async () => {
  const f = fixture();
  const warm = f.api.loadCategoryPage(), open = f.api.loadCategoryPage();
  assert.equal(warm, open);
  assert.equal((await open).default, 'ProfileCategoryPage');
  await f.api.loadCategoryPage();
  assert.deepEqual(f.calls, ['ProfileCategoryPage']);
  await f.api.loadVisitorProjectPage(); assert.equal(f.calls.at(-1),'VisitorProjectPage');
});
