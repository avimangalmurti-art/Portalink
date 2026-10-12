import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
import {imports as journeyImports,recordProps} from './helpers/journey-view-fixture.mjs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
const profile={id:'owner',name:'Example Creator',categories:[{id:'design',label:'Design'}],projects:[{id:'p',title:'One work',madeOn:'2026-10-01',categoryId:'design',summary:'A study.',attachments:[]}]};
const auth={isAuthenticated:true,viewerProfileId:'owner',user:{id:'account'}};
const data={profileId:'owner',generatedAt:'2026-10-12',months:[{month:'2026-10',works:1,citations:0}],fields:[{year:2026,portals:[{portalId:'design',works:1,share:1}]}],quarters:[{quarter:'2026-Q4',works:1,references:0}],projects:[{projectId:'p',reads:null,medianPageReached:null,medianSeconds:null,citations:null,references:null,daysSinceMade:11,weeks:Array.from({length:12},(_,i)=>({week:String(i),reads:null}))}]};
const model=sourceModule('src/features/journey/insightsModel.ts');
const metrics=sourceModule('src/features/journey/InsightMetrics.tsx',{react:React,'./insightsModel':model}).InsightMetrics;
test('unknown numbers display em dashes instead of fabricated zeros',()=>{const html=renderToStaticMarkup(React.createElement(metrics,{work:data.projects[0]}));assert.equal((html.match(/—/g)??[]).length,5);assert.match(html,/11/);assert.doesNotMatch(html,/>0</);});
test('owner header defaults to Record; visitors have the unchanged Journey element without a toggle',()=>{
 let viewer=auth;const fake={...React,useState:value=>[value,()=>{}],lazy:()=> 'insights'};
 const module=sourceModule('src/features/journey/OwnerJourneyView.tsx',{react:fake,'../../contexts/AuthContext':{useAuth:()=>viewer},'./JourneyView':{JourneyView:'record'},'./journey-insights.css':{}});
 const owner=module.OwnerJourneyView({profile,owner:true,onOpen(){}});const rendered=owner.type(owner.props);assert.equal(nodes(rendered).find(n=>n.type==='button'&&n.props.children==='Record').props['aria-pressed'],true);assert.equal(nodes(rendered).some(n=>n.type==='record'),true);assert.equal(nodes(rendered).some(n=>n.type==='insights'),false);
 for(const value of [{isAuthenticated:false},{...auth,viewerProfileId:'other'}]){viewer=value;const result=module.OwnerJourneyView({profile,owner:true,onOpen(){}});assert.equal(result.type,'record');assert.equal(result.props.owner,false);assert.equal(nodes(result).some(n=>n.type==='nav'),false);}
});
test('Insights empty state keeps its one-work strip; bar tap targets the same timeline month and row tap opens the card selection',()=>{
 let stateIndex=0;const values=[data,'',false,0,null],changes=[],scrolls=[],offsets=[];const fake={...React,useEffect(){},useRef:()=>({current:{closest:()=>({querySelector:()=>({getBoundingClientRect:()=>({bottom:185})})}),style:{setProperty:(_key,value)=>offsets.push(value)},querySelector:selector=>({scrollIntoView:options=>scrolls.push({selector,options})})}}),useState:value=>[values[stateIndex++]??value,next=>changes.push(next)]};
 const View=sourceModule('src/features/journey/JourneyInsightsView.tsx',{react:fake,'../../contexts/AuthContext':{useAuth:()=>auth},'./insightsService':{},'./InsightsTimeline':{InsightsTimeline:'timeline'},'./InsightRowCard':{InsightRowCard:'card'}},{window:{matchMedia:()=>({matches:true})}}).JourneyInsightsView;
 const tree=View({profile,owner:true,onOpen(){}}),all=nodes(tree);assert.ok(all.some(n=>n.type==='p'&&n.props.children==='Insights grow as you publish and as people read and cite your work.'));
 all.find(n=>n.type==='g'&&n.props.role==='button').props.onClick();assert.equal(scrolls[0].selector,'[data-insights-month="2026-10"]');assert.equal(scrolls[0].options.behavior,'auto');assert.equal(offsets[0],'193px');
 all.find(n=>n.type==='timeline').props.onSelectWork(profile.projects[0]);assert.equal(changes.at(-1),profile.projects[0]);
});
test('row card shows the same five metric groups and a twelve-week sparkline without interpolating missing history',()=>{
 const Card=sourceModule('src/features/journey/InsightRowCard.tsx',{react:React,'../../components/ui/ModalPortal':{ModalPortal:({children})=>children},'../../hooks/useModalFocus':{useModalFocus(){}},'./InsightMetrics':{InsightMetrics:metrics}}).InsightRowCard;
 const work={...data.projects[0],reads:12,weeks:data.projects[0].weeks.map((row,i)=>({...row,reads:i===5?null:i}))};const html=renderToStaticMarkup(React.createElement(Card,{title:'One work',work,onClose(){}}));assert.match(html,/role="dialog"/);assert.equal((html.match(/<dt>/g)??[]).length,5);assert.equal((html.match(/<circle/g)??[]).length,11);assert.equal((html.match(/<line/g)??[]).length,9);assert.match(html,/last 12 weeks/);
});
test('public profile serialization, visitor entry and cite renderers contain no Insights fields or endpoint',()=>{
 for(const path of ['src/services/supabase/sharedProfileBundle.ts','src/visitor/VisitorApp.tsx','src/server/citation.ts','src/features/citations/model.ts','src/features/journey/JourneyView.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/medianPageReached|medianSeconds|daysSinceMade|\/api\/insights|OwnerJourneyView|JourneyInsightsView/);
});
test('real Insights timeline exposes month anchors and opens the selected work without changing chronological order',()=>{
 const selected=[],fake={...React,useState:value=>[value,()=>{}]};const Timeline=sourceModule('src/features/journey/InsightsTimeline.tsx',{...journeyImports,react:fake,'./InsightMetrics':{InsightMetrics:metrics}}).InsightsTimeline;
 const tree=Timeline({...recordProps,owner:true,insights:{projects:[]},onSelectWork:project=>selected.push(project.id)}),rows=nodes(tree).filter(n=>n.type==='li'&&n.props['data-insights-project']);assert.deepEqual(rows.map(row=>row.props['data-insights-project']),['private','new','old']);assert.equal(rows.at(-1).props['data-insights-month'],'2024-02');nodes(rows.at(-1)).find(n=>n.props.className==='journey-title').props.onClick();assert.deepEqual(selected,['old']);
});
