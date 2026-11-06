import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  if (node.type.name === 'MobileProjectFileTile') return nodes(node.type(node.props));
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

/** Run the actual editor and its MOBILE frame; only management/services are synthetic. */
function harness(presentation='mobile'){
 const instances=new Map(),calls=[],focus=[];let current,dirty=true,tree,frame,modalClose;
 const surface={focus(){focus.push('dialog');},querySelector:()=>({focus(){focus.push('cover');}})};
 const react={...React,
  useState(initial){const index=current.cursor++;if(!(index in current.slots))current.slots[index]=typeof initial==='function'?initial():initial;const slots=current.slots;return[slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true;}}];},
  useRef(value){const index=current.cursor++;return current.slots[index]??={current:value};},
  useEffect(callback,deps){const index=current.cursor++,before=current.slots[index];if(!before||deps.some((value,item)=>!Object.is(value,before.deps[item]))){current.slots[index]={deps,pending:true,callback,cleanup:before?.cleanup};}},
  useImperativeHandle(ref,create){if(ref)ref.current=create();},
 };
 const attachments=Array.from({length:15},(_,index)=>({id:`file-${index+1}`,kind:'image',fileName:`Artwork ${index+1}.png`,displayName:`Artwork ${index+1}`,typeLabel:'Image',sourceUrl:`blob:synthetic-${index+1}`,metadata:{widthPixels:1600,heightPixels:1200}}));
 const editor={projectId:'project',mode:'files',phase:'editing',metadata:{title:'Title only',summary:''},fieldErrors:{},originalAttachments:attachments,attachmentEdits:attachments.map((item,index)=>({id:item.id,displayName:item.displayName,isCover:index===0,coverFrame:{x:.5,y:.5,zoom:1}})),
  addedMedia:{items:[],capability:{isAvailable:true},isFull:false},upload:{phase:'idle',itemProgress:{},isBusy:false,isCleaningUp:false},isSaving:false,isTransferring:false,isDirty:true,previewAspectRatio:4/3,
  setField(key,value){editor.metadata[key]=value;dirty=true;},
  moveAttachment(id,direction){const from=editor.attachmentEdits.findIndex(item=>item.id===id),to=from+direction;if(to<0||to>=editor.attachmentEdits.length)return;const next=[...editor.attachmentEdits],moved=next.splice(from,1)[0];next.splice(to,0,moved);editor.attachmentEdits=next;calls.push(['move',id,direction]);dirty=true;},
  setCover(id){editor.attachmentEdits=editor.attachmentEdits.map(item=>({...item,isCover:item.id===id}));calls.push(['cover',id]);dirty=true;},
  setCoverFrame(id,coverFrame){editor.attachmentEdits=editor.attachmentEdits.map(item=>item.id===id?{...item,coverFrame}:item);calls.push(['frame',id,coverFrame]);dirty=true;},
  setAttachmentTitle(id,displayName){editor.attachmentEdits=editor.attachmentEdits.map(item=>item.id===id?{...item,displayName}:item);dirty=true;},
  async save(){calls.push(['save',editor.metadata,editor.attachmentEdits]);return null;},async close(){calls.push(['close']);return true;},
 };
 const imports={react,'../../components/publishing/useAuthoringFocus':{useAuthoringFocus(){}},'../../presentation/usePresentation':{usePresentation:()=>presentation},'../../hooks/useDialogViewport':{useDialogViewport:()=>react.useRef(surface)},'../../hooks/useModalFocus':{useModalFocus:(open,ref,onClose,preventScroll)=>{assert.equal(open,true);assert.equal(preventScroll,true);modalClose=onClose;}},'../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},'../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../components/ui/ConfirmationDialog':{ConfirmationDialog:'confirmation'},'../../components/media/ProjectCoverRepositionDialog':{ProjectCoverRepositionDialog:'cover-crop'},'../../components/media/ProjectCover':{ProjectCover:'cover'},'../../components/publishing/CoverFilmstrip':{PublishedCoverFilmstrip:'published-covers'},'../../components/publishing/ProjectFormDialog':{ProjectFormDialog:'web-frame',ProjectDiscardConfirmation:'discard'},'../../components/publishing/ProjectPreviewFrame':{ProjectPreviewFrame:'preview'},'../../components/profile/ProfileField':{ProfileField:'field'},'../../components/ui/Button':{Button:'button'},'../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},'../../components/ui/ResponsiveImage':{ResponsiveImage:'image'},'../../components/ui/StateViews':{ErrorState:'error',LoadingState:'loading'},'../publishing/validation':{TITLE_MAX_LENGTH:80},'lucide-react':new Proxy({},{get:(_,key)=>key})};
 const {ProjectEditorDialog}=sourceModule('src/features/projects/ProjectEditorDialog.tsx',imports,{document:{getElementById:id=>({focus(){focus.push(id);}})},requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){}});
 const run=(id,callback)=>{if(!instances.has(id))instances.set(id,{slots:[],cursor:0});current=instances.get(id);current.cursor=0;const result=callback();for(const slot of current.slots)if(slot?.pending){slot.pending=false;slot.cleanup?.();slot.cleanup=slot.callback();}return result;};
 const render=()=>{for(let pass=0;dirty;pass++){assert.ok(pass<15);dirty=false;frame=run('editor',()=>ProjectEditorDialog({management:{editor}}));tree=typeof frame.type==='function'?run('frame',()=>frame.type(frame.props)):frame;}return tree;};
 return {editor,calls,focus,render,frame:()=>{render();return frame;},find:predicate=>nodes(render()).find(predicate),escape(){render();modalClose();},update(values){Object.assign(editor,values);dirty=true;},async submit(){const form=nodes(render()).find(node=>node.type==='form');form.props.onSubmit({preventDefault(){}});for(let index=0;index<4;index++)await Promise.resolve();render();}};
}

test('mobile editor submits from the compact header action and accepts an empty description',async()=>{
 const h=harness(),tree=h.render();
 const dialog=nodes(tree).find(node=>node.props.role==='dialog');assert.equal(dialog.props['aria-modal'],'true');
 const form=nodes(dialog).find(node=>node.type==='form'),header=nodes(dialog).find(node=>node.type==='header');
 const save=nodes(header).find(node=>node.props.className==='project-editor-header-save');
 assert.ok(save);assert.equal(save.props.type,'submit');assert.equal(save.props.form,form.props.id);
 assert.equal(save.props.children,'Save');assert.equal(save.props['aria-label'],'Save changes');assert.equal(save.props.disabled,false);
 assert.equal(nodes(dialog).filter(node=>node.props.type==='submit').length,1);
 assert.equal(nodes(form).some(node=>node.type==='footer'),false);
 h.update({isDirty:false});assert.equal(h.find(node=>node.props.className==='project-editor-header-save').props.disabled,true);
 h.update({isDirty:true,isSaving:true});const busy=h.find(node=>node.props.className==='project-editor-header-save');
 assert.equal(busy.props.disabled,true);assert.equal(busy.props.isLoading,true);assert.equal(busy.props['aria-label'],'Saving…');
 h.update({isSaving:false});
 h.find(node=>node.type==='button'&&node.props.children==='Details').props.onClick();
 const title=h.find(node=>node.type==='field'&&node.props.id==='project-title');assert.equal(title.props.required,true);assert.equal(title.props.requiredIndicator,'parenthesized');
 const summary=h.find(node=>node.type==='field'&&node.props.id==='project-summary');assert.equal(summary.props.required,undefined);assert.equal(summary.props.optional,true);assert.equal(summary.props.optionalParentheses,true);
 await h.submit();assert.equal(h.calls.at(-1)[0],'save');assert.equal(h.calls.at(-1)[1].summary,'');
});

test('the unified mobile Files grid numbers the draft order and keeps crop and order changes pending until Save',async()=>{
 const h=harness();h.update({mode:'cover-choice'});
 const tabs=h.find(node=>node.props['aria-label']==='Edit project sections');
 assert.deepEqual(React.Children.toArray(tabs.props.children).map(button=>button.props.children),['Details','Files']);
 assert.equal(React.Children.toArray(tabs.props.children)[1].props['aria-pressed'],true);
 const fileCards=()=>nodes(h.render()).filter(node=>node.props.className==='project-editor-file-card');
 assert.equal(fileCards().length,15);
 assert.equal(h.find(node=>node.type==='published-covers'),undefined);
 assert.equal(h.find(node=>node.props.className?.includes('project-edit-file-row')),undefined);
 h.find(node=>node.props['aria-label']==='Move Artwork 15 earlier').props.onClick();
 assert.equal(h.editor.attachmentEdits[13].id,'file-15');
 const moved=nodes(fileCards()[13]);
 assert.equal(moved.find(node=>node.props.className==='project-editor-file-position').props.children,14);
 moved.find(node=>node.props['data-project-cover-choice']!==undefined).props.onClick();
 assert.equal(h.find(node=>node.props['aria-label']==='Use Artwork 15 as the cover').props['aria-pressed'],true);
 h.find(node=>node.type==='button'&&node.props.children==='Edit cover').props.onClick();
 const crop=h.find(node=>node.type==='cover-crop');assert.equal(crop.props.source,'blob:synthetic-15');
 const frame={x:.2,y:.8,zoom:2,aspectRatio:3/4};crop.props.onSave({frame});
 assert.equal(h.find(node=>node.type==='cover-crop'),undefined);assert.equal(h.editor.attachmentEdits.find(item=>item.id==='file-15').coverFrame,frame);
 assert.equal(h.calls.some(call=>call[0]==='save'),false);
 await h.submit();assert.equal(h.calls.filter(call=>call[0]==='save').length,1);assert.equal(h.calls.at(-1)[2][13].id,'file-15');
});

test('mobile modal Escape shares guarded close/discard behavior while WEB retains its dialog frame',()=>{
 const h=harness();h.escape();assert.ok(h.find(node=>node.type==='discard'));
 h.find(node=>node.type==='discard').props.onKeep();assert.equal(h.find(node=>node.type==='discard'),undefined);
 h.update({isSaving:true});h.escape();assert.equal(h.find(node=>node.type==='discard'),undefined);assert.equal(h.calls.length,0);
 h.update({isSaving:false,isDirty:false});h.escape();assert.deepEqual(h.calls,[['close']]);
 const web=harness('web');assert.equal(web.render().type,'web-frame');assert.equal(nodes(web.render()).some(node=>node.props['data-mobile-upload-surface']),false);
 assert.equal(nodes(web.find(node=>node.type==='footer')).find(node=>node.props.type==='submit').props.children,'Save changes');
 assert.equal(nodes(web.render()).filter(node=>node.props.className?.includes('project-edit-file-row')).length,15);
 assert.equal(web.find(node=>node.type==='field'&&node.props.id==='project-title').props.requiredIndicator,undefined);
 assert.equal(web.find(node=>node.type==='field'&&node.props.id==='project-summary').props.optionalParentheses,false);
 web.update({mode:'cover-choice'});
 assert.ok(web.find(node=>node.type==='published-covers'));
 assert.equal(web.find(node=>node.props.className==='project-editor-file-grid'),undefined);
});
