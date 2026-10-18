import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const nodes=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(nodes)]:[];
function harness(overrides={}){
 let cursor=0,trap;const slots=[],effects=[],calls=[];
 const react={...React,useId:()=> 'confirmation',useRef(value){return slots[cursor++]??={current:value};},useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],next=>{slots[i]=next;}];},useEffect(fn){effects.push(fn);}};
 const api=sourceModule('src/components/ui/ConfirmationDialog.tsx',{react,'react-dom':{createPortal:child=>child},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(open,ref,cancel){trap={open,ref,cancel};}},'../../presentation/usePresentation':{usePresentation:()=> 'mobile'},'./ModalPortal':{ModalPortal:'portal'},'../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},'./DestructiveWarning':{DestructiveWarning:'warning-animation'},'./confirmation-dialog.css':{}},{document:{fullscreenElement:null},Error});
 const props={title:'Delete this work?',description:'This cannot be undone.',confirmLabel:'Delete work',variant:'destructive',onConfirm:()=>{calls.push('confirm');},onCancel:()=>calls.push('cancel'),...overrides};
 const render=()=>{cursor=0;effects.length=0;return api.ConfirmationDialog(props);};
 const button=(tree,index)=>nodes(tree).filter(n=>n.type==='button')[index];
 return {render,props,calls,button,effects,get trap(){return trap;}};
}
test('shared confirmation has safe focus, accessible context, and backdrop never accepts or dismisses',()=>{
 const h=harness(),tree=h.render(),safe=h.button(tree,0),dialog=nodes(tree).find(n=>n.props.role==='alertdialog');
 assert.equal(dialog.props['aria-modal'],'true');assert.equal(dialog.props['aria-labelledby'],'confirmation-title');assert.equal(dialog.props['aria-describedby'],'confirmation-description');
 let focus=0;safe.ref.current={focus(){focus++;}};h.effects.forEach(fn=>fn());assert.equal(focus,1);
 nodes(tree).find(n=>n.props.role==='presentation').props.onPointerDown({stopPropagation(){}});assert.deepEqual(h.calls,[]);h.trap.cancel();assert.deepEqual(h.calls,['cancel']);
});
test('pending synchronous lock prevents duplicate writes and cancel; completion re-enables retry',async()=>{
 let resolve,writes=0;const h=harness({onConfirm:()=>{writes++;return new Promise(done=>{resolve=done;});}});const tree=h.render();h.button(tree,1).props.onClick();h.button(tree,1).props.onClick();h.button(tree,0).props.onClick();assert.equal(writes,1);assert.deepEqual(h.calls,[]);
 assert.equal(h.button(h.render(),1).props.disabled,true);resolve(false);await new Promise(done=>setImmediate(done));const failed=h.render();assert.ok(nodes(failed).find(n=>n.props.role==='alert'));assert.equal(h.button(failed,1).props.disabled,false);h.button(failed,0).props.onClick();assert.deepEqual(h.calls,['cancel']);
});
test('externally pending and unavailable operations cannot run',()=>{
 for(const overrides of [{pending:true},{confirmDisabled:true}]){const h=harness(overrides),tree=h.render();h.button(tree,1).props.onClick();assert.deepEqual(h.calls,[]);}
});
test('project discard adapter preserves existing error and async cleanup contract',()=>{
 const api=sourceModule('src/components/publishing/ProjectFormDialog.tsx',{react:React,'framer-motion':{},'lucide-react':{},'../../hooks/useModalFocus':{},'../../hooks/useTouchTap':{},'../ui/ModalPortal':{},'../ui/InterfaceIcon':{},'../ui/ConfirmationDialog':{ConfirmationDialog:'confirmation'},'../../hooks/useDialogViewport':{},'./project-dialog.css':{}},{React});
 const cleanup=async()=>{};const tree=api.ProjectDiscardConfirmation({title:'Discard draft?',description:'Draft files will be lost.',error:'Cleanup failed.',busy:true,onKeep:()=>{},onDiscard:cleanup});assert.equal(tree.type,'confirmation');assert.equal(tree.props.pending,true);assert.equal(tree.props.error,'Cleanup failed.');assert.equal(tree.props.onConfirm,cleanup);assert.equal(tree.props.cancelLabel,'Keep editing');
});

test('only destructive decisions include animation and confirm is immediately usable',async()=>{
 const h=harness();let tree=h.render();assert.ok(nodes(tree).some(n=>n.type==='warning-animation'));
 assert.equal(h.button(tree,1).props.disabled,false);await h.button(tree,1).props.onClick();assert.deepEqual(h.calls,['confirm']);
 h.props.variant='standard';tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='warning-animation'),false);
});
