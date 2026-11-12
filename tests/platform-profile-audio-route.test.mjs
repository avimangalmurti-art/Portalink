import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const app = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const appContent = app.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AppContent');
const audioOwner = appContent.body.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations[0].name.getText(app) === 'profileAudioRouteOwner');
const audioEffect = appContent.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(app) === 'useLayoutEffect'
  && node.expression.arguments[1]?.getText(app) === '[profileAudioRouteOwner]');
const audioPreparation = appContent.body.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression) && node.expression.expression.getText(app) === 'usePrepareProfileAudio');
assert.ok(audioOwner && audioEffect && audioPreparation, 'AppContent must manage profile audio at the route layout boundary');
const lifecycle = new vm.Script(ts.transpileModule([audioOwner, audioEffect, audioPreparation].map(node => node.getText(app)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText);

function mountPlatformAudioScope() {
  const cleared = [];
  const prepared = [];
  let previousOwner;
  let cleanup;
  function useLayoutEffect(effect, [owner]) {
    if (owner === previousOwner) return;
    cleanup?.();
    cleanup = effect();
    previousOwner = owner;
  }
  return {
    cleared,
    prepared,
    navigate(kind, profileId, { isAuthenticated = true, presentation = 'mobile', search = '' } = {}) {
      lifecycle.runInNewContext({
        URLSearchParams,
        auth: { isAuthenticated, viewerProfileId: 'me', user: isAuthenticated ? { id: 'account' } : null },
        route: { kind, profileId },
        presentation,
        search,
        useLayoutEffect,
        clearProfileAudioForProfile: owner => cleared.push(owner),
        usePrepareProfileAudio: (owner, account) => { if (owner) prepared.push([owner, account]); },
      });
    },
    unmount() { cleanup?.(); },
  };
}

test('the signed-in owner keeps the audio session through the profile, portals and project reader', () => {
  const platform = mountPlatformAudioScope();
  platform.navigate('profile', 'me');
  platform.navigate('portals');
  platform.navigate('category', 'me');
  platform.navigate('project', 'me');
  platform.navigate('category', 'me');
  platform.navigate('portals');
  platform.navigate('profile', 'me');
  assert.deepEqual(platform.cleared, []);
  platform.navigate('home');
  platform.navigate('search');
  assert.deepEqual(platform.cleared, ['me']);
});

test('changing creators or opening a separate signed-in screen clears only the departing profile', () => {
  const platform = mountPlatformAudioScope();
  platform.navigate('profile', 'first');
  platform.navigate('project', 'first');
  platform.navigate('profile', 'second');
  assert.deepEqual(platform.cleared, ['first']);
  platform.navigate('messages');
  assert.deepEqual(platform.cleared, ['first', 'second']);
  platform.navigate('profile', 'me');
  platform.navigate('profileEditor');
  assert.deepEqual(platform.cleared, ['first', 'second', 'me']);
});

test('shared catalogue routes do not own the platform session, and unmount releases the signed-in track', () => {
  const platform = mountPlatformAudioScope();
  platform.navigate('sharedProfile', 'shared');
  platform.navigate('sharedProject', 'shared');
  platform.navigate('home');
  platform.navigate('profile', 'signed-out', { isAuthenticated: false });
  assert.deepEqual(platform.cleared, []);
  platform.navigate('profile', 'me');
  platform.unmount();
  assert.deepEqual(platform.cleared, ['me']);
});

test('audio preparation is limited to the signed-in mobile profile overview', () => {
  const platform = mountPlatformAudioScope();
  platform.navigate('sharedProfile', 'shared');
  platform.navigate('profile', 'desktop', { presentation: 'web' });
  platform.navigate('profile', 'signed-out', { isAuthenticated: false });
  platform.navigate('profile', 'visitor', { search: '?view=portals' });
  platform.navigate('project', 'visitor');
  assert.deepEqual(platform.prepared, []);
  platform.navigate('profile', 'visitor');
  assert.deepEqual(platform.prepared, [['visitor', 'account']]);
});
