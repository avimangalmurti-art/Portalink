import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/citations/model.ts');
const {CitationCards}=sourceModule('src/citation/CitationCards.tsx',{'react':React,'lucide-react':{SatelliteDishIcon:()=>React.createElement('svg',{'aria-hidden':true})},'../features/citations/model':model,'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalink.test'},'./citation-entry.css':{}});
const {RouteError,routeErrorKind}=sourceModule('src/components/ui/RouteError.tsx',{'react':React,'./route-error.css':{}});
const item={id:'example-image',creator:'Example Creator',creatorId:'example',projectTitle:'Field Notes',projectId:'work',attachmentId:'image',madeOn:'2024-06-15',kind:'image',number:1,citable:true,storagePath:null};
for(const [name,variant] of Object.entries({image:item,page:{...item,kind:'page',number:2},citable:item,'view-only':{...item,citable:false}}))test(`citation ${name} card snapshot`,()=>{
 const html=renderToStaticMarkup(React.createElement(CitationCards,{item:variant,preview:React.createElement('img',{src:'/example.png',alt:'Field Notes'}),onCopy(){},onCite(){},onShare(){}}));
 const file=`tests/fixtures/citation-cards/${name}.html`;if(process.env.UPDATE_SNAPSHOTS==='1'){mkdirSync('tests/fixtures/citation-cards',{recursive:true});writeFileSync(file,html+'\n');}
 assert.equal(html,readFileSync(file,'utf8').trim());assert.match(html,/Copy plain text/);assert.match(html,/Copy BibTeX/);assert.doesNotMatch(html,/dock|navigation/i);
});
for(const kind of ['not-found','no-access','expired','network'])test(`${kind} renders the shared route error with one exit pill`,()=>{
 const html=renderToStaticMarkup(React.createElement(RouteError,{kind,onBack(){},onHome(){}}));assert.match(html,new RegExp(`data-error-kind="${kind}"`));assert.match(html,/route-error-card/);assert.equal((html.match(/<button/g)||[]).length,2);assert.match(html,/Go to Home/);assert.doesNotMatch(html,/dock/);
});
test('known creator gets the one creator exit and no extra Home pill',()=>{const html=renderToStaticMarkup(React.createElement(RouteError,{kind:'not-found',creatorHandle:'creator',onBack(){},onHome(){},onCreator(){}}));assert.match(html,/Open the creator/);assert.doesNotMatch(html,/Go to Home/);});
test('classified failures map accurately; unknown absence never reveals private access',()=>{assert.equal(routeErrorKind('Link expired'),'expired');assert.equal(routeErrorKind('Access denied'),'no-access');assert.equal(routeErrorKind('could not be found'),'not-found');assert.equal(routeErrorKind('fetch failed'),'network');});
test('normal and visitor route shells use the same error component',()=>{for(const path of ['src/App.tsx','src/visitor/VisitorApp.tsx','src/citation/index.tsx'])assert.match(readFileSync(path,'utf8'),/<RouteError/);});
