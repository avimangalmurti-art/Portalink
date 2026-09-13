import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function harness(initialPresentation = 'mobile') {
  let presentation = initialPresentation;
  let identity;
  const calls = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/AppScreenLayers.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return { ...React, useRef: initial => identity ??= { current: initial } };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useScreenTransition')) return { useScreenTransition: (key, snapshot, reduce, skip) => {
      calls.push({ key, reduce, skip });
      return [{ id: 0, screenKey: key, phase: 'screen-active', snapshot }];
    } };
    return { MobileBackScope: 'back-scope' };
  } });
  return { calls, resize: value => { presentation = value; }, render: (screenKey, mobileProfileKey, skipLayerTransition = false) => exports.AppScreenLayers({
    screenKey, mobileProfileKey, snapshot: { content: React.createElement('profile'), mainClassName: 'screen', ariaLabel: 'Profile' },
    reduceMotion: false, skipLayerTransition, mainContentRef: { current: null }, onScroll() {},
  }) };
}

test('mobile profile, portals, and every project workspace share one transition identity', () => {
  const h = harness();
  for (const destination of ['profile-creator', 'in-design-portals', 'category-creator-a', 'category-creator-b', 'profile-creator']) {
    h.render(destination, 'mobile-profile-viewer-creator-false', destination.includes('category'));
  }
  assert.equal(new Set(h.calls.map(call => call.key)).size, 1);
  assert.equal(h.calls[2].skip, true, 'Media continuity remains available without replacing the profile');
});

test('other creators, access states, account changes, and public shares never inherit the prior workspace', () => {
  const h = harness();
  h.render('profile-creator', 'mobile-profile-viewer-creator-false');
  h.render('profile-other', 'mobile-profile-viewer-other-false');
  h.render('route-state-/p/other', undefined);
  h.render('profile-other', 'mobile-profile-viewer-other-false');
  h.render('profile-other', 'mobile-profile-new-account-other-false');
  h.render('shared-profile-other', 'mobile-profile-new-account-other-true');
  assert.notEqual(h.calls[0].key, h.calls[1].key);
  assert.equal(h.calls[2].key, 'route-state-/p/other');
  assert.notEqual(h.calls[2].key, h.calls[3].key);
  assert.notEqual(h.calls[3].key, h.calls[4].key);
  assert.notEqual(h.calls[4].key, h.calls[5].key);
});

test('WEB preserves destination transitions and resizing alone does not remount work', () => {
  const h = harness('web');
  h.render('profile-creator', 'profile-scope');
  h.render('category-creator-a', 'profile-scope');
  assert.deepEqual(h.calls.map(call => call.key), ['profile-creator', 'category-creator-a']);
  h.resize('mobile');
  h.render('category-creator-a', 'profile-scope');
  h.render('profile-creator', 'profile-scope');
  assert.equal(h.calls[2].key, h.calls[1].key);
  assert.equal(h.calls[3].key, h.calls[1].key);
  h.resize('web');
  h.render('profile-creator', 'profile-scope');
  assert.equal(h.calls[4].key, h.calls[3].key);
  h.render('category-creator-a', 'profile-scope');
  assert.notEqual(h.calls[5].key, h.calls[4].key, 'Returning to an old WEB destination still transitions after resizing');
  h.render('category-creator-b', 'profile-scope');
  assert.equal(h.calls[6].key, 'category-creator-b');
});
