import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
import {hookHarness} from './helpers/hook-harness.mjs';

test('Studio Cited renders an external receipt without requiring a citing project',()=>{
 const item={id:'page',kind:'page',number:7,projectTitle:'SDOF Structure',creator:'Ana'};
 const row={citation:{id:'event',source:'external',context:'Lecture notes',created_at:'2026-10-07'},item,project:null};
 let index=0;const react={...React,useEffect(){},useState(initial){const n=index++;return [n===0?[row]:n===1?'ready':initial,()=>{}];}};
 const {StudioCitations}=sourceModule('src/features/citations/StudioCitations.tsx',{'react':react,'../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'creator'})},'../studio/StudioRow':{StudioRow:p=>React.createElement('li',null,p.title,' · ',p.secondary)},'../studio/StudioActionSheet':{StudioActionSheet:()=>null},'./service':{},'./model':{citationPath:id=>'/cite/'+id}});
 const html=renderToStaticMarkup(React.createElement(StudioCitations,{mode:'cited'}));
 assert.match(html,/Someone outside Portalink/);assert.match(html,/Page 7 of SDOF Structure/);assert.match(html,/Lecture notes/);assert.doesNotMatch(html,/Project unavailable/);
});

test('public Journey renders external citation context from the single profile bundle',async()=>{
 const h=hookHarness('src/features/citations/useJourneyCitations.ts','useJourneyCitations',{}, {},[{id:'creator',publicCitationEvents:[{id:'event',source:'external',direction:'incoming',item_id:'page',label:'page 7',created_at:'2026-10-07',context:'Lecture notes'}]},false],{}, {'./service':{listCitations:()=>{throw Error('Unexpected second query');}},'./model':{citationPath:id=>'/cite/'+id}});
 const rows=await h.flush();assert.equal(rows.length,1);assert.equal(rows[0].label,'Someone cited page 7 outside Portalink · Lecture notes');assert.equal(rows[0].href,'/cite/page');h.dispose();
});

test('How to connect page gives the production URL and no sign-in requirement',()=>{
 const {ConnectAiPage}=sourceModule('src/features/citations/ConnectAiPage.tsx',{'react':React,'./publicOrigin':{PUBLIC_ORIGIN:'https://portalink.example'}});
 const html=renderToStaticMarkup(React.createElement(ConnectAiPage,{onBack(){}}));assert.match(html,/https:\/\/portalink.example\/mcp/);assert.match(html,/Claude/);assert.match(html,/ChatGPT/);assert.match(html,/no Portalink login/);
});
