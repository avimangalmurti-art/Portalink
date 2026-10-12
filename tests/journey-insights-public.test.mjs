import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,existsSync} from 'node:fs';
import {publicJourney,recordProps} from './helpers/journey-view-fixture.mjs';
import {sourceModule} from './helpers/source-module.mjs';
test('public Journey snapshot stays unchanged and the main-app visitor wrapper produces exactly the same record',()=>{
 const baseline=readFileSync(new URL('./fixtures/public-journey-record.html',import.meta.url),'utf8');
 const html=renderToStaticMarkup(React.createElement(publicJourney.JourneyView,recordProps));assert.equal(html,baseline);assert.doesNotMatch(html,/Private work|Reads|Read depth|References used|Insights/);
 const wrapper=sourceModule('src/features/journey/OwnerJourneyView.tsx',{react:React,'../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:false})},'./JourneyView':publicJourney,'./journey-insights.css':{}}).OwnerJourneyView;
 assert.equal(renderToStaticMarkup(React.createElement(wrapper,recordProps)),baseline);
});
test('emitted visitor and cite graphs contain no owner Insights module, schema or endpoint',()=>{
 const root=new URL('../',import.meta.url),graph=JSON.parse(readFileSync(new URL('logs/client-module-graph.json',root))),manifest=JSON.parse(readFileSync(new URL('dist/client/.vite/manifest.json',root)));
 for(const entry of ['share.html','cite.html']){const visited=new Set();function walk(file){if(visited.has(file))return;visited.add(file);const chunk=graph.find(row=>row.file===file);assert.ok(chunk);for(const child of [...chunk.imports,...(chunk.dynamicImports??[])])walk(child);}walk(manifest[entry].file);
 const modules=[...visited].flatMap(file=>graph.find(row=>row.file===file).modules).map(file=>file.replaceAll('\\','/'));assert.deepEqual(modules.filter(file=>/features\/journey\/(?:OwnerJourney|JourneyInsights|InsightsTimeline|InsightMetrics|InsightRowCard|insightsModel|insightsService)/.test(file)),[]);
 if(entry==='share.html'){const normalize=file=>{for(const section of ['/src/','/node_modules/','/public/']){const at=file.indexOf(section);if(at>=0)return file.slice(at+1);}return file.endsWith('/share.html')?'share.html':file;};const baseline=JSON.parse(readFileSync(new URL('tests/fixtures/journey-visitor-module-set.json',root)));assert.deepEqual([...new Set(modules.map(normalize))].sort(),baseline);}
 for(const file of visited){const asset=new URL('dist/client/'+file,root);if(existsSync(asset))assert.doesNotMatch(readFileSync(asset,'utf8'),/medianPageReached|medianSeconds|daysSinceMade|\/api\/insights/);}
 }
});
