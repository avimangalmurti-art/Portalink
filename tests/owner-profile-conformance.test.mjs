import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
const routes=sourceModule('src/app/routes.ts',{'../components/navigation':{navigationDestinations:[]}});
const preview=sourceModule('src/features/profile/visitorPreview.ts',{'../../app/routes':routes});
const id='00000000-0000-4000-8000-000000000001';
test('visitor preview is owner-scoped and Done is a canonical internal owner route',()=>{
 assert.equal(preview.visitorPreviewPath(id),`/share/${id}?visitorPreview=1`);
 assert.equal(preview.visitorPreviewReturn(id),`/p/${id}`);
 assert.equal(preview.isOwnVisitorPreview('?visitorPreview=1',id,id),true);
 for(const [search,profile,viewer] of [['',id,id],['?visitorPreview=1',id,null],['?visitorPreview=1',id,'other'],['?visitorPreview=1',null,id],['?visitorPreview=https://outside.test',id,id]])assert.equal(preview.isOwnVisitorPreview(search,profile,viewer),false);
});
test('preview bar snapshot contains only its exact notice and the Done action',()=>{
 let done=0;const {VisitorPreviewBar}=sourceModule('src/features/profile/VisitorPreviewBar.tsx',{react:React,'./visitor-preview.css':{}});
 const bar=VisitorPreviewBar({onDone:()=>done++});
 assert.equal(bar.type,'header');assert.equal(bar.props['aria-label'],'Visitor preview');
 const children=React.Children.toArray(bar.props.children);assert.equal(children[0].props.children,'Viewing as a visitor');assert.equal(children[1].props.children,'Done');children[1].props.onClick();assert.equal(done,1);
});
test('owner shell stays on device theme; public renderer remains bound to creator branding',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),visitor=readFileSync(new URL('../src/visitor/VisitorApp.tsx',import.meta.url),'utf8');
 assert.match(readFileSync(new URL('../src/components/UserProfilePage.tsx',import.meta.url),'utf8'),/useJourneySelection\(profile.id, auth.viewerProfileId, false\)/);
 assert.match(app,/const interfaceTheme = theme;/);assert.match(app,/const interfaceAccentColor = accentColor;/);assert.doesNotMatch(app,/const interfaceTheme = .*publicAppearance/);
 assert.match(visitor,/const publicStyle = profile\?\.publicAppearance/);assert.match(visitor,/const accentColor = publicStyle\?\.accentColor/);
});
test('standard profile Actions uses theme text with no independent saturated accent',()=>{
 const css=readFileSync(new URL('../src/presentation/mobile/mobile.css',import.meta.url),'utf8');
 const monochrome=css.slice(css.indexOf('/* Screen actions show the ellipsis only;'),css.indexOf('/* Every Studio state anchors'));
 assert.match(monochrome,/background: transparent !important; color: var\(--text-primary\) !important/);
 assert.doesNotMatch(monochrome,/#(?:[a-f\d]{3}|[a-f\d]{6})\b|magenta|fuchsia|pink|var\(--accent/i);
});
