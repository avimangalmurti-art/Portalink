import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../src/components/media/FollowContentInfoPopup.tsx',import.meta.url),'utf8');
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function render({guest=false,reduce=false,hasOptions=true}={}) {
 const calls=[],effects=[],timers=[]; const reader={inert:false};
 const host={querySelectorAll:()=>[reader]};
 const mocks={react:{...React,useState:initial=>[initial,()=>{}],useRef:()=>({current:null}),useEffect:fn=>effects.push(fn),useLayoutEffect:fn=>effects.push(fn)},
  'react-dom':{createPortal:n=>n},'lucide-react':{},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},
  '../../hooks/useModalFocus':{useModalFocus(){}},'../../features/comments/useProjectComments':{useProjectComments:id=>{assert.equal(id,'actual-id');return{phase:'ready',totalCount:7};}},
  '../../features/engagement/EngagementBar':{EngagementFeedback:'feedback'},'../text/FormattedText':{FormattedText:'formatted'},'../ui/InterfaceIcon':{InterfaceIcon:'icon'},'./follow-content-info.css':{}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports,require:id=>{assert.ok(id in mocks,id);return mocks[id];},document:{querySelector:()=>host},window:{matchMedia:()=>({matches:reduce})},setTimeout:(fn,ms)=>{timers.push({fn,ms});return 1;},clearTimeout(){}});
 const tree=exports.FollowContentInfoPopup({projectId:'actual-id',title:'Real title',description:'First paragraph\n\nSecond paragraph',creatorHeader:React.createElement('button',null,'Real creator'),engagement:{count:kind=>kind==='save'?12:4,isEngaged:kind=>kind==='save',isPending:()=>false,isResolving:false,resolveError:null,toggle:kind=>calls.push(kind)},onOptions:hasOptions?()=>calls.push('options'):undefined,onComments:()=>calls.push('comments'),onRequireAccount:guest?()=>calls.push('signup'):undefined,onClose:()=>calls.push('close')});
 return {tree,calls,effects,timers,reader};
}
test('Follow popup uses real content and exactly comments/bookmark/repost, with existing callbacks',()=>{
 const {tree,calls}=render(); const all=nodes(tree);
 assert.equal(all.find(n=>n.type==='h2').props.children,'Real title');
 assert.equal(all.find(n=>n.type==='formatted').props.text,'First paragraph\n\nSecond paragraph');
 const group=all.find(n=>n.props.role==='group');const buttons=nodes(group).filter(n=>n.type==='button');
 assert.equal(buttons.length,3);assert.deepEqual(buttons.map(b=>nodes(b).find(n=>n.type==='span').props.children),[7,12,4]);
 assert.equal(buttons[1].props['aria-pressed'],true);
 buttons.forEach(b=>b.props.onClick());all.find(n=>n.props['aria-label']==='Content options').props.onClick();
 assert.deepEqual(calls,['comments','save','repost','options']);
 assert.equal(all.filter(n=>/close/i.test(n.props['aria-label']??'')).length,0);
});
test('outside dismissal waits for exit; inside click does not dismiss; reduced motion has no delay',()=>{
 for(const reduce of [false,true]){const {tree,calls,timers}=render({reduce});const overlay=nodes(tree).find(n=>n.props.className==='follow-info-overlay');
 overlay.props.onClick({target:{},currentTarget:overlay,stopPropagation(){}});assert.equal(timers.length,0);
 overlay.props.onClick({target:overlay,currentTarget:overlay,stopPropagation(){}});assert.equal(timers[0].ms,reduce?0:180);assert.deepEqual(calls,[]);timers[0].fn();assert.deepEqual(calls,['close']);}
});
test('reader inert state is restored, and guests use existing signup gate',()=>{
 const {tree,calls,effects,reader}=render({guest:true});const cleanup=effects.at(-1)();assert.equal(reader.inert,true);cleanup();assert.equal(reader.inert,false);
 const group=nodes(tree).find(n=>n.props.role==='group');nodes(group).filter(n=>n.type==='button')[1].props.onClick();assert.deepEqual(calls,['signup']);
});



test('search preview omits unavailable three-dot menu while keeping content and engagement',()=>{
 const {tree}=render({hasOptions:false});const all=nodes(tree);
 assert.equal(all.some(n=>n.props['aria-label']==='Content options'),false);
 assert.equal(all.find(n=>n.type==='h2').props.children,'Real title');
 assert.equal(nodes(all.find(n=>n.props.role==='group')).filter(n=>n.type==='button').length,3);
});
