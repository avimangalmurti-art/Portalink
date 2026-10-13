import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const {LoadingSkeleton}=sourceModule('src/components/ui/StateViews.tsx',{react:React,'lucide-react':{},'./Button':{},'./InterfaceIcon':{},'../../utils/projectContinuity':{projectContinuityStyle:()=>({})}});
const shapes=kind=>renderToStaticMarkup(React.createElement(LoadingSkeleton,{kind,label:'Opening'})).split('class="screen-loading-shapes"')[1].split('class="legacy-loading-shapes"')[0];
test('Profile reserves identity, inline tabs and projects rather than inbox rows',()=>{const html=shapes('profile');for(const name of ['loading-profile-identity','loading-inline-tabs','loading-profile-counts','loading-project-grid'])assert.ok(html.includes(name));assert.ok(!html.includes('loading-item-list'));assert.ok(html.includes('aria-hidden="true"'));});
test('Journey, conversation and Insights have distinct destination geometry',()=>{assert.ok(shapes('journey').includes('loading-date'));assert.ok(!shapes('journey').includes('loading-profile-identity'));assert.ok(shapes('conversation').includes('loading-conversation'));assert.ok(shapes('insights').includes('loading-chart'));assert.ok(shapes('messages').includes('loading-avatar'));});
test('Home grid respects the requested density and loading remains accessible',()=>{const html=renderToStaticMarkup(React.createElement(LoadingSkeleton,{kind:'grid',columns:4,label:'Loading Home'}));assert.ok(html.includes('--loading-columns:4'));assert.ok(html.includes('role="status"'));assert.ok(html.includes('aria-label="Loading Home"'));});

test('Journey keeps its previous desktop Profile fallback while mobile uses timeline shapes',()=>{const tree=LoadingSkeleton({kind:'journey'});assert.equal(tree.props.className,'motion-profile-skeleton');const html=renderToStaticMarkup(tree);assert.ok(html.split('class="legacy-loading-shapes"')[1].includes('motion-profile-identity'));});
