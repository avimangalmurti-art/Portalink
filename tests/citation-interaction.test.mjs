import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
function harness(){
 let sheet=true,closed=0,effects=[];const intents=new Map(),replaced=[];
 const auth={isInitializing:false,isAuthenticated:false,viewerProfileId:null,pendingView:null};
 const react={...React,lazy:()=> 'AuthDialog',useState:()=>[sheet,next=>{sheet=typeof next==='function'?next(sheet):next;}],useEffect:fn=>effects.push(fn)};
 const module=sourceModule('src/citation/CitationInteraction.tsx',{'../index.css':{},react,'react-router-dom':{BrowserRouter:'Router'},'../contexts/ServicesContext':{ServicesProvider:'Services'},'../contexts/AuthContext':{AuthProvider:'Auth',useAuth:()=>auth},'../services/visitorServices':{visitorServices:{}},'../presentation/AppPresentation':{AppPresentationProvider:'Presentation'},'../features/citations/CiteSheet':{CiteSheet:'CiteSheet'}},{sessionStorage:{getItem:key=>intents.get(key),removeItem:key=>intents.delete(key)},history:{replaceState:(...args)=>replaced.push(args)},location:{pathname:'/cite/item',search:''}});
 let leaf=module.default({item:{id:'item'},onClose:()=>closed++});while(typeof leaf.type!=='function')leaf=leaf.props.children;
 const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):tree&&typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[];
 return {auth,intents,replaced,get closed(){return closed;},render(){effects=[];const tree=leaf.type(leaf.props);effects.forEach(fn=>fn());return tree;},find:(tree,type)=>nodes(tree).find(node=>node.type===type)};
}
test('guest Create account keeps the lazy authentication host mounted; cancellation closes it',()=>{const h=harness();const sheet=h.find(h.render(),'CiteSheet');h.auth.pendingView='signUp';sheet.props.onClose();const tree=h.render();assert.equal(h.closed,0);assert.ok(h.find(tree,'AuthDialog'));assert.equal(h.find(tree,'CiteSheet'),undefined);h.auth.pendingView=null;h.render();assert.equal(h.closed,1);});
test('confirmed sign-in consumes the existing intent and reopens Cite without closing the host',()=>{const h=harness();const sheet=h.find(h.render(),'CiteSheet');h.intents.set('portalink:cite-intent','item');h.auth.pendingView='signUp';sheet.props.onClose();h.render();h.auth.pendingView=null;h.auth.isAuthenticated=true;h.auth.viewerProfileId='confirmed-creator';h.render();assert.ok(h.find(h.render(),'CiteSheet'));assert.equal(h.closed,0);assert.equal(h.intents.size,0);assert.equal(h.replaced[0][2],'/cite/item');});
test('closing the normal Cite dialog closes its host once',()=>{const h=harness();h.find(h.render(),'CiteSheet').props.onClose();h.render();assert.equal(h.closed,1);});
