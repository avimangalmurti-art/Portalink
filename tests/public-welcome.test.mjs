import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
test('visitor entry never mounts a blocking appearance sheet', () => {
  const source = readFileSync(new URL('../src/visitor/VisitorApp.tsx', import.meta.url),'utf8');
  assert.doesNotMatch(source, /appearanceConfirmed/);
  assert.doesNotMatch(source, /PublicPortfolioWelcome/);
  assert.doesNotMatch(source, /shouldWelcomePublicVisitor|welcomedProfileId/);
  assert.match(source, /ControlCenterPage/);
});
