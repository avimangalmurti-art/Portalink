import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
const nodes = n => React.isValidElement(n) ? [n, ...React.Children.toArray(n.props.children).flatMap(nodes)] : [];
test('Studio header exposes Bookmarks without New project or Insights', () => {
 const { StudioWorkbenchHeader } = sourceModule('src/features/studio/StudioWorkbenchView.tsx', {
 'react': React, '../../presentation/mobile/MobileContextActions': { MobileContextButton: 'actions' },
 'lucide-react': {}, '../../components/media/ProjectCover': {}, './StudioRow': {}, './StudioActionSheet': {},
 './workbenchModel': {}, './studio-workbench.css': {},
 });
 let opened = false;
 const tree = StudioWorkbenchHeader({ onBookmarks: () => { opened = true; }, onReads() {}, workspace: { onContinue() {} } });
 assert.deepEqual(nodes(tree).filter(n => n.type === 'strong').map(n => n.props.children), ['Bookmarks']);
 nodes(tree).find(n => n.type === 'button').props.onClick();
 assert.equal(opened, true);
});

test('mobile Drafts restores Back while WEB retains its existing navigation', () => {
 const react = {...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const {StudioDraftsList} = sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,
  'react-dom':{createPortal:children=>children},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
 });
 const props={drafts:[],onBack(){},onResume(){},onDiscard:async()=>{},onBookmarks(){},onReads(){}};
 const mobile = nodes(StudioDraftsList({...props,hideBack:true}));
 assert.equal(mobile.some(n=>n.props['aria-label']==='Back from Drafts'),true);
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Select'));
 const web = nodes(StudioDraftsList(props));
 assert.ok(web.some(n=>n.props['aria-label']==='Back from Drafts'));
});

test('mobile Studio shares its layout while WEB retains its rail',()=>{
 const source=readFileSync('src/features/studio/StudioPage.tsx','utf8');assert.match(source,/mobile\?<MobileLibraryLayout/);assert.match(source,/headerRef=\{setHeaderHost\}/);assert.match(source,/onChange=\{pill=>/);assert.match(source,/<StudioOverview/);
});
