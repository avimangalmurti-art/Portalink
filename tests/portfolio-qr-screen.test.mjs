import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
test('QR PNG preserves existing generation, quiet zone, contrast and integer scaling',()=>{
 let encoded,options,draw,fill;
 const ctx={fillRect:(...args)=>{fill=args;},drawImage:(...args)=>{draw=args;}};
 const raw={width:49},out={getContext:()=>ctx};let index=0;
 const {createPortfolioQrImage}=sourceModule('src/features/sharing/portfolioQr.ts', {'lean-qr':{generate:url=>{encoded=url;return {toCanvas:(_canvas,value)=>{options=value;}};}}},{document:{createElement:()=>index++===0?raw:out},Error});
 assert.equal(createPortfolioQrImage('https://example.test/current'),out);assert.equal(encoded,'https://example.test/current');
 assert.equal(options.pad,4);assert.deepEqual(Array.from(options.off),[255,255,255,255]);assert.equal(out.width,1024);assert.equal(out.height,1024);
 assert.equal(ctx.fillStyle,'#fff');assert.equal(ctx.imageSmoothingEnabled,false);assert.deepEqual(fill,[0,0,1024,1024]);assert.equal(draw[3]%raw.width,0);assert.equal(draw[1],draw[2]);
});
const nodes=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(nodes)]:[];
test('QR screen shows reliable ready/error states, retry and existing sharing actions',()=>{
 let state=[0,{url:'',error:''}],slot=0,effect;let fail=false,encoded;
 const qr={width:0,height:0,getContext:()=>({drawImage(){}})};
 const {PortfolioQrScreen}=sourceModule('src/features/sharing/PortfolioQrScreen.tsx', {react:{useRef:()=>({current:qr}),useState:()=>{const i=slot++;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect:fn=>{effect=fn;}},'lucide-react':{CopyIcon:'copy',DownloadIcon:'download',QrCodeIcon:'qr-icon',SendIcon:'send',CheckIcon:'check'},'../../components/profile/CreatorAvatar':{CreatorAvatar:'avatar'},'../../components/ui/Button':{Button:'button'},'./portfolioQr':{createPortfolioQrImage:url=>{encoded=url;if(fail)throw new Error('Generation failed');return {width:1024,height:1024};}}},{React,Error});
 let saved=0,copied=0,sent=0;const props={profile:{name:'Existing',avatar:'photo',location:'City',projects:[],categories:[]},url:'https://example.test/current',heading:'qr',busy:false,onSave:()=>saved++,onCopy:()=>copied++,onSend:()=>sent++};
 const render=()=>{slot=0;return nodes(PortfolioQrScreen(props));};
 let all=render();assert.equal(all.find(node=>node.type==='canvas').props.hidden,true);effect();all=render();assert.equal(encoded,props.url);assert.equal(all.find(node=>node.type==='canvas').props.hidden,false);
 const actions=all.filter(node=>node.type==='button');actions.forEach(node=>node.props.onClick());assert.deepEqual([saved,copied,sent],[1,1,1]);
 props.url='https://example.test/new';fail=true;render();effect();all=render();assert.ok(all.some(node=>node.props.role==='alert'));assert.equal(all.find(node=>node.props.className==='share-qr-save').props.disabled,true);
 all.find(node=>node.type==='button' && node.props.children==='Retry QR code').props.onClick();fail=false;render();effect();all=render();assert.equal(all.find(node=>node.type==='canvas').props.hidden,false);assert.equal(encoded,props.url);
});
