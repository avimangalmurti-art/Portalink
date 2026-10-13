import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {readFileSync} from 'node:fs';import {sourceModule} from './helpers/source-module.mjs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
test('Library keeps one safe area, header, tab rail, spacing and scroll boundary for every section',()=>{
 const {MobileLibraryLayout}=sourceModule('src/features/studio/MobileLibraryLayout.tsx',{react:React,'./mobile-library-layout.css':{}});
 for(const active of ['overview','drafts','published','bookmarks','references','cited','all']){
 let selected;const tree=nodes(MobileLibraryLayout({active,tabs:['overview','drafts','published','bookmarks','references','cited','all'],headerRef(){},fallback:React.createElement('button',{disabled:true},'Select'),onChange:id=>selected=id,children:React.createElement('p',null,'Long title without a subtitle')}));
 for(const attr of ['data-library-safe-area','data-library-header','data-library-tabs','data-library-spacing','data-library-content'])assert.equal(tree.filter(n=>attr in n.props).length,1);
 const pill=tree.find(n=>n.props['data-studio-pill']===active);assert.equal(pill.props['aria-pressed'],true);pill.props.onClick();assert.equal(selected,active);
 const rail={clientWidth:420,scrollLeft:0};pill.ref({offsetLeft:700,clientWidth:100,parentElement:rail});assert.equal(rail.scrollLeft,540);assert.equal('scrollTop' in rail,false);
 }
});
test('Library geometry uses one fixed token contract, no section offsets or text-derived heights',()=>{
 const css=readFileSync('src/features/studio/mobile-library-layout.css','utf8');for(const token of ['header-height','navigation-height','horizontal-padding','control-size','select-width','control-gap','content-spacing'])assert.match(css,new RegExp('--library-'+token+':'));
 assert.match(css,/grid-template-rows:var\(--safe-area-top/);assert.match(css,/var\(--library-header-height\) var\(--library-navigation-height\)/);assert.match(css,/\[data-library-content\][^{]*\{[^}]*overflow-y:auto/);assert.match(css,/mobile-dock-size/);assert.match(css,/safe-area-bottom/);assert.doesNotMatch(css,/collection=|data-studio-pill=/);
 const legacy=readFileSync('src/presentation/mobile/mobile.css','utf8');assert.doesNotMatch(legacy,/studio-mobile-shell-header[^{}]*\{/);
});
