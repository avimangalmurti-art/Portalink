import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
test('warning plays three times inline, falls back on error and responds to reduced motion',()=>{
 let cursor=0,effect,listener,removed=false;const state=[];
 const preference={matches:true,addEventListener(_event,fn){listener=fn;},removeEventListener(){removed=true;}};
 const react={...React,useRef(value){const i=cursor++;if(!(i in state))state[i]={current:value};return state[i];},useState(value){const i=cursor++;if(!(i in state))state[i]=value;return[state[i],v=>state[i]=v];},useEffect(fn){effect=fn;}};
 const {DestructiveWarning}=sourceModule('src/components/ui/DestructiveWarning.tsx',{react},{window:{matchMedia:()=>preference}});
 const render=()=>{cursor=0;return nodes(DestructiveWarning());};
 render();const cleanup=effect();assert.ok(render().some(n=>n.type==='img'));assert.equal(render().some(n=>n.type==='video'),false);
 preference.matches=false;listener();let video=render().find(n=>n.type==='video');assert.ok(video.props.autoPlay&&video.props.muted&&video.props.playsInline);assert.equal(video.props.loop,undefined);let replays=0; const player={currentTime:10,play(){replays++;return Promise.resolve();}}; video.props.onEnded({currentTarget:player}); assert.equal(replays,1); assert.equal(player.currentTime,0); video=render().find(n=>n.type===`video`); video.props.onEnded({currentTarget:player}); assert.equal(replays,2); video.props.onEnded({currentTarget:player}); assert.equal(replays,2,`The third completed play must stop without replaying`);
 preference.matches=true;listener();assert.equal(render().some(n=>n.type==='video'),false);
 preference.matches=false;listener();assert.equal(render().some(n=>n.type==='video'),false,'Changing preferences cannot start a fourth play');video.props.onError();assert.ok(render().some(n=>n.type==='img'));cleanup();assert.ok(removed);
});
