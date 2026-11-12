import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('owner shell stays on device theme; public renderer defaults to creator branding',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),visitor=readFileSync(new URL('../src/visitor/VisitorApp.tsx',import.meta.url),'utf8');
 assert.match(readFileSync(new URL('../src/components/UserProfilePage.tsx',import.meta.url),'utf8'),/useJourneySelection\(profile.id, auth.viewerProfileId, false\)/);
 assert.match(app,/const interfaceTheme = theme;/);assert.match(app,/const interfaceAccentColor = accentColor;/);assert.doesNotMatch(app,/const interfaceTheme = .*publicAppearance/);
 assert.match(visitor,/const publicStyle = profile\?\.publicAppearance/);assert.match(visitor,/const accentColor = appearance\.publicAccentColor \?\? publicStyle\?\.accentColor/);
});
test('standard profile Actions uses theme text with no independent saturated accent',()=>{
 const css=readFileSync(new URL('../src/presentation/mobile/mobile.css',import.meta.url),'utf8');
 const monochrome=css.slice(css.indexOf('/* Screen actions show the ellipsis only;'),css.indexOf('/* Every Studio state anchors'));
 assert.match(monochrome,/background: transparent !important; color: var\(--text-primary\) !important/);
 assert.doesNotMatch(monochrome,/#(?:[a-f\d]{3}|[a-f\d]{6})\b|magenta|fuchsia|pink|var\(--accent/i);
});
