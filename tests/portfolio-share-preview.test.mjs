import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
const createElement=(type,props,...children)=>({type,props:props||{},children});
class Component {constructor(props){this.props=props;}setState(value){this.state={...this.state,...value};}}
const module=sourceModule('src/features/sharing/PortfolioSharePreview.tsx',{react:{createElement,Component},'../../components/profile/CreatorAvatar':{CreatorAvatar:'avatar'},'lucide-react':{ArrowLeftIcon:'back'},'../../hooks/useDialogViewport':{useDialogViewport:()=>null},'./sharing.css':{}});
const profile={name:'Actual creator',location:'Actual location',avatar:'existing.png',projects:[{},{}],categories:[{}],showJourney:true};
test('loading and ready previews preserve the same structure and actual identity',()=>{
 const ready=module.PortfolioSharePreview({profile});const loading=module.PortfolioSharePreview({profile,loading:true});
 assert.equal(ready.children.length,loading.children.length);assert.equal(loading.props['aria-busy'],true);assert.equal(loading.props['data-loading'],true);assert.equal(ready.children[1].children[0].children[0],profile.name);assert.equal(ready.children[0].props.avatar,profile.avatar);
});
test('preview failure stays inside the preview and retry restores the original child',()=>{
 const boundary=new module.PortfolioPreviewBoundary({profile,children:'working preview'});assert.equal(boundary.render(),'working preview');boundary.state=module.PortfolioPreviewBoundary.getDerivedStateFromError();const failed=boundary.render();assert.equal(failed.props.className,'share-preview-recovery');const button=failed.children[1].children[1];assert.equal(button.children[0],'Retry preview');button.props.onClick();assert.equal(boundary.render(),'working preview');
});

test('public sharing preview omits connection counts even when provided',()=>{
 const preview=module.PortfolioSharePreview({profile,counts:{followers:'9',following:'7'}});
 const rendered=JSON.stringify(preview);
 assert.doesNotMatch(rendered,/followers|following/);
 assert.match(rendered,/projects/);assert.match(rendered,/portals/);
});
