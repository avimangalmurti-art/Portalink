import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
test('profiles open on Portfolio despite saved Journey and still allow Journey in the current visit',()=>{
 let state,effects=[],reads=0,writes=0;
 const hooks={useState:init=>{if(state===undefined)state=init();return[state,value=>{state=value}];},useEffect:fn=>effects.push(fn)};
 const mod=sourceModule('src/features/journey/useJourneySelection.ts',{react:hooks,'./journey':{journeyPreferenceKey:(viewer,profile)=>viewer+':'+profile,readJourneyPreference:()=>{reads++;return 'journey'},rememberJourneyPreference:()=>writes++}});
 assert.equal(mod.useJourneySelection('profile','owner',false).view,'portfolio');
 effects.splice(0).forEach(fn=>fn());
 mod.useJourneySelection('profile','owner',false).select('journey');
 assert.equal(mod.useJourneySelection('profile','owner',false).view,'journey');
 assert.equal(mod.useJourneySelection('other','owner',false).view,'portfolio');
 state=undefined;assert.equal(mod.useJourneySelection('profile',null,false).view,'portfolio');
 assert.equal(reads,0);assert.equal(writes,0);
});
