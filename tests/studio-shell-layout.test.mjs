import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('fixed app header centres only horizontally and uses dock material and soft edges',()=>{
 const source=readFileSync('src/presentation/mobile/MobilePillHeader.tsx','utf8');
 assert.match(source,/element.scrollLeft = centredPillOffset/);
 assert.doesNotMatch(source,/scrollIntoView/);
 assert.match(source,/useMobileScreenActive/);
 assert.match(source,/createPortal\(header,host\)/);
 const css=readFileSync('src/presentation/mobile/mobile-pill-header.css','utf8');
 assert.match(css,/position: fixed/);assert.match(css,/mask-image: linear-gradient/);
 assert.match(css,/--navigation-surface/);assert.match(css,/--navigation-blur/);
});
test('Studio owns one fixed header including unavailable and empty tabs',()=>{
 const source=readFileSync('src/features/studio/StudioPage.tsx','utf8');
 assert.equal((source.match(/<MobilePillHeader/g)||[]).length,1);
 assert.match(source,/dockEntry!=='studio'/);
 assert.match(source,/headerHost=\{mobile\?headerHost:undefined\}/);
 assert.doesNotMatch(source,/studio-mobile-header-fallback/);
 const css=readFileSync('src/presentation/mobile/mobile.css','utf8').split('/* Fixed Studio/Messages/Profile')[1];
 assert.match(css,/overflow-y: auto/);assert.match(css,/--mobile-dock-size/);assert.match(css,/--safe-area-bottom/);
 assert.match(css,/-webkit-line-clamp:2/);
});
