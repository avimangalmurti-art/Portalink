import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = path => readFileSync(new URL('../src/'+path, import.meta.url), 'utf8');
test('public video cards enable the existing inline muted playback fallback', () => {
 assert.match(source('visitor/VisitorProfileGrid.tsx'), /allowVideoFallback=\{true\}/);
 assert.match(source('components/media/ProjectCover.tsx'), /attachment.kind === 'video' && attachment.sourceUrl/);
});
test('public reader has no duplicate floating action button', () => {
 assert.match(source('visitor/VisitorApp.tsx'), /showFloatingActions=\{!projectId && !handleError && !invalidShared/);
 assert.match(source('presentation/mobile/MobileContextActions.tsx'), /currentScreen\(\) && showFloatingButton/);
});
test('reader information opens publicly and guest engagement closes it before signup', () => {
 const viewer=source('components/media/ProjectMediaViewer.tsx');
 assert.match(viewer, /onClick=\{\(\) => setMobilePopup\('description'\)\}/);
 assert.match(viewer, /\? \(\) => \{ closeMobilePopup\(\); journeyAuth.requestAuthenticatedDestination/);
});
test('shared and invitation signup use the default appearance-first onboarding', () => {
 for (const path of ['App.tsx','visitor/VisitorApp.tsx']) assert.doesNotMatch(source(path), /initialSignupStep=/);
 assert.match(source('features/auth/AuthDialog.tsx'), /props.initialSignupStep \?\? 'appearance'/);
});