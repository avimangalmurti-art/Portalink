import test from 'node:test';import assert from 'node:assert/strict';import React from 'react';import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/citations/model.ts');const formats=sourceModule('src/features/citations/formats.ts',{'./model':model},{Date});
const item={id:'source/page-30',creator:'A. Researcher',creatorId:'source-owner',projectId:'source-project',projectTitle:'Deep LRS Layouts',kind:'page',number:30,madeOn:'2026-10-06'};
test('copy formats identify the source creator, project, page and stable source URL',()=>{for(const format of ['mla','apa','plain','bibtex']){const value=formats.formatCitation(item,'https://portalink.example',format);assert.match(value,/A. Researcher/);assert.match(value,/Deep LRS Layouts/);assert.match(value,/Page 30/);assert.match(value.replaceAll('\\%','%'),/source%2Fpage-30/);assert.doesNotMatch(value,/My project/);}});
test('draft citation dates use each style order and unavailable dates are not invented',()=>{assert.match(formats.formatCitation(item,'https://portalink.example','mla'),/6 Oct 2026/);assert.match(formats.formatCitation(item,'https://portalink.example','apa'),/2026, October 6/);assert.match(formats.formatCitation({...item,madeOn:''},'https://portalink.example','apa'),/n.d./);assert.doesNotMatch(formats.formatCitation({...item,madeOn:'2026-02-31'},'https://portalink.example','mla'),/Mar|Feb|2026/);});

const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
const text=tree=>typeof tree==='string'?tree:Array.isArray(tree)?tree.map(text).join(''):React.isValidElement(tree)?text(tree.props.children):'';
function copyHarness(presentation='mobile'){
 const slots=[],pending=[],writes=[];let cursor=0,dirty=true,effects=[],tree,currentItem={...item,citable:false};
 const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const react={...React,useRef(value){const index=cursor++;return slots[index]??={current:value};},useState(initial){const index=cursor++;if(!(index in slots))slots[index]={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(!Object.is(value,slots[index].value)){slots[index].value=value;dirty=true;}}];},useEffect(effect,deps){const index=cursor++,previous=slots[index];if(!equal(previous?.deps,deps)){slots[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{previous?.cleanup?.();slots[index].cleanup=effect();});}},useMemo(fn,deps){const index=cursor++;if(!equal(slots[index]?.deps,deps))slots[index]={deps,value:fn()};return slots[index].value;}};
 const {CiteSheet}=sourceModule('src/features/citations/CiteSheet.tsx',{
  react,'../../presentation/motion/useSheetMotion':{useSheetMotion:()=>({closing:false,close(){}})},'./publicOrigin':{PUBLIC_ORIGIN:'https://portalink.example'},'../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true,viewerProfileId:'source-owner',phase:'authenticated',isInitializing:false})},'../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../services/supabase/client':{requireSupabase(){assert.fail('Copying your own citation must never query projects');}},'./model':model,'./service':{citeItem(){assert.fail('Copying must not attach a reference');},citationNote(){assert.fail('Copying must not save notes');}},'./citations.css':{},'./formats':formats,'../../hooks/useModalFocus':{useModalFocus(){}},'../../presentation/usePresentation':{usePresentation:()=>presentation},'lucide-react':{CheckIcon:'check-icon'},'../../components/ui/InterfaceIcon':{InterfaceIcon:'interface-icon'},
 },{navigator:{clipboard:{writeText(value){writes.push(value);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}}}});
 const render=()=>{for(let pass=0;dirty;pass++){assert.ok(pass<12,'Copy state must settle');dirty=false;cursor=0;effects=[];tree=CiteSheet({item:currentItem,onClose(){}});effects.forEach(effect=>effect());}return tree;};
 const button=()=>nodes(render()).find(node=>node.type==='button'&&(/^Copy /.test(text(node))||text(node)==='Copied'));
 return {render,writes,pending,button,preview:()=>nodes(render()).find(node=>node.props.className==='cite-preview').props.value,click(){button().props.onClick();},format(value){nodes(render()).find(node=>node.type==='select').props.onChange({target:{value}});},item(value){currentItem={...currentItem,...value};dirty=true;render();},async flush(){await Promise.resolve();await Promise.resolve();render();},status:()=>nodes(render()).filter(node=>node.props.role==='status').map(text),errors:()=>nodes(render()).filter(node=>node.props.role==='alert').map(text)};
}

test('MOBILE shows Copied and a check only after the exact preview text is written, and a repeated attempt resets feedback',async()=>{
 const h=copyHarness();assert.equal(text(h.button()),'Copy MLA');h.click();
 assert.deepEqual(h.writes,[h.preview()]);assert.equal(text(h.button()),'Copy MLA');assert.deepEqual(h.status(),[]);
 h.pending[0].resolve();await h.flush();assert.equal(text(h.button()),'Copied');
 assert.ok(nodes(h.button()).some(node=>node.type==='interface-icon'&&node.props.icon==='check-icon'));
 assert.deepEqual(h.status(),['MLA citation copied.']);
 h.click();assert.equal(text(h.button()),'Copy MLA');assert.deepEqual(h.status(),[]);
 h.pending[1].resolve();await h.flush();assert.equal(text(h.button()),'Copied');assert.equal(h.writes.length,2);
});

test('a clipboard failure clears previous copy success and retains the manual-copy preview',async()=>{
 const h=copyHarness();h.click();h.pending[0].resolve();await h.flush();h.click();h.pending[1].reject(new Error('Synthetic clipboard denial'));await h.flush();
 assert.equal(text(h.button()),'Copy MLA');assert.deepEqual(h.status(),[]);assert.equal(nodes(h.button()).some(node=>node.type==='interface-icon'),false);
 assert.match(h.errors().join(' '),/could not be copied.*preview text/);assert.equal(h.preview(),h.writes[0]);
});

test('format and source changes reset successful copy feedback to the currently displayed citation',async()=>{
 const h=copyHarness();h.click();h.pending[0].resolve();await h.flush();
 h.format('apa');assert.equal(text(h.button()),'Copy APA');assert.deepEqual(h.status(),[]);assert.notEqual(h.preview(),h.writes[0]);
 h.click();assert.equal(h.writes[1],h.preview());h.pending[1].resolve();await h.flush();assert.equal(text(h.button()),'Copied');
 h.item({id:'source/page-31',number:31});assert.equal(text(h.button()),'Copy APA');assert.deepEqual(h.status(),[]);assert.match(h.preview(),/Page 31/);
});

test('old clipboard completions cannot restore feedback after a format/source change or replace the latest result',async()=>{
 const h=copyHarness();h.click();h.format('apa');h.render();h.pending[0].resolve();await h.flush();
 assert.equal(text(h.button()),'Copy APA');assert.deepEqual(h.status(),[]);
 h.click();h.item({id:'source/page-31',number:31});h.pending[1].resolve();await h.flush();assert.deepEqual(h.status(),[]);assert.equal(text(h.button()),'Copy APA');
 h.click();h.click();h.pending[3].resolve();await h.flush();assert.equal(text(h.button()),'Copied');
 h.pending[2].reject(new Error('Old failed attempt'));await h.flush();assert.equal(text(h.button()),'Copied');assert.deepEqual(h.errors(),[]);assert.deepEqual(h.status(),['APA citation copied.']);
});

test('WEB retains its original copy label and no check while sharing the successful live status',async()=>{
 const h=copyHarness('web');h.click();assert.equal(text(h.button()),'Copy MLA');h.pending[0].resolve();await h.flush();
 assert.equal(text(h.button()),'Copy MLA');assert.equal(nodes(h.button()).some(node=>node.type==='interface-icon'),false);assert.deepEqual(h.status(),['MLA citation copied.']);
 h.format('bibtex');h.render();h.click();assert.equal(h.writes.at(-1),h.preview());h.pending[1].reject(new Error('Denied'));await h.flush();assert.equal(text(h.button()),'Copy BibTeX');assert.ok(h.errors().length);
});
