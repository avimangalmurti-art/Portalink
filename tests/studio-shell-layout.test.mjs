import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('Studio rail follows the safe-area header and selected pills never scroll vertically',()=>{
 const source=readFileSync('src/features/studio/StudioPage.tsx','utf8');
 assert.ok(source.indexOf('className="studio-mobile-shell-header"')<source.indexOf('className="studio-citation-pills"'));
 assert.match(source,/<StudioOverview/);assert.match(source,/rail\.scrollLeft=/);assert.doesNotMatch(source,/scrollIntoView/);
 const css=readFileSync('src/presentation/mobile/mobile.css','utf8');
 const scoped=css.slice(css.indexOf('/* Studio: one stationary safe-area header'));
 assert.match(scoped,/data-presentation='mobile'/);assert.match(scoped,/padding-top: var\(--mobile-screen-action-top\)/);
 assert.match(scoped,/\.studio-citation-shell \{\s*height: var\(--mobile-viewport-height, 100dvh\); overflow: hidden/);
 assert.match(scoped,/\.studio-workbench-scroll \{\s*overflow-y: auto; flex: 1; min-height: 0/);
 assert.match(readFileSync('src/features/studio/studio-workbench.css','utf8'),/\.studio-mobile-shell-header \{ display: none/);
});


test('mobile Studio header receives existing collection controls and hides its redundant title',()=>{
 const source=readFileSync('src/features/studio/StudioPage.tsx','utf8');
 assert.match(source,/className="studio-mobile-header-controls" ref=\{setHeaderHost\}/);
 assert.match(source,/<BookmarksList headerHost=\{mobile\?headerHost:undefined\}/);
 assert.match(source,/<StudioDraftsList key="drafts" headerHost=\{mobile\?headerHost:undefined\}/);
 const css=readFileSync('src/presentation/mobile/mobile.css','utf8');
 assert.match(css, /data-presentation='mobile'\] \.studio-mobile-shell-header h1 \{ display: none;/);
});

test('mobile landing overview is the first tab, with reference-style fallback header controls', () => {
 const source=readFileSync('src/features/studio/StudioPage.tsx','utf8');
 assert.match(source,/mobile\?\['overview'\]:\[\]\),'drafts','published'/);
 assert.match(source,/collection\?\?\(mobile\?'overview':'all'\)/);
 assert.match(source,/mobile&&!collectionHeader&&!insightsOverview&&<div className="studio-mobile-header-fallback"/);
 assert.match(source,/aria-label="Back from Studio"/);
 assert.match(source,/className="studio-text-control" aria-label="Select items" disabled>Select/);
 assert.match(source,/<BookmarksList headerHost=\{mobile\?headerHost:undefined\}/);
 assert.match(source,/<StudioDraftsList key="drafts" headerHost=\{mobile\?headerHost:undefined\}/);
});
