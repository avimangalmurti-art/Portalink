import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness({mobile=true,reduce=false}={}){
 const slots=[],effects=[],frames=[],scrolls=[];let cursor=0,adds=0;
 const links=[{id:'old',label:'Website',href:'https://example.com',iconName:'globe'}];
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect:fn=>effects.push(fn),useMemo:fn=>fn()};
 const mocks={'react':react,'react-dom':{createPortal:n=>n},'framer-motion':{Reorder:{Group:'group',Item:'item'},useReducedMotion:()=>reduce},'lucide-react':{},'../../utils/radioGroupKeyboard':{},'../../hooks/useModalFocus':{useModalFocus(){}},'../../presentation/usePresentation':{usePresentation:()=>mobile?'mobile':'web'},'../../components/profile/PortalIconLibrary':{PortalIconLibrary:'library'},'../../components/profile/categoryIcons':{getCategoryIcon:()=> 'icon',getPortalIconLabel:n=>n,portalIconNames:['globe','lucide:accessibility'],profileLinkIconOptions:[{name:'globe',label:'Globe',isBrand:false}]},'../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},'./profileLinks':{inferProfileLinkIconName:()=> 'globe',isProfileLinkAction:()=>false,MAX_PROFILE_LINKS:20},'./validation':{PROFILE_LINK_LABEL_MAX_LENGTH:80,PROFILE_LINK_URL_MAX_LENGTH:2048}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/profile/ProfileLinksEditor.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:id=>{assert.ok(id in mocks,id);return mocks[id];},document:{getElementById:id=>({scrollIntoView:options=>scrolls.push({id,...options})})},window:{matchMedia:()=>({matches:reduce})},requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){}});
 return {links,scrolls,get adds(){return adds;},render(){cursor=0;effects.length=0;return exports.ProfileLinksEditor({links,compact:mobile,errors:{},disabled:false,onAdd(){const id=`new-${++adds}`;links.push({id,label:'',href:'',iconName:'globe'});return id;},onChange(){},onRemove(){},onReorder(){}});},flush(){effects.forEach(fn=>fn());frames.splice(0).forEach(fn=>fn());}};
}
const add=tree=>nodes(tree).find(n=>n.type==='button'&&React.Children.toArray(n.props.children).includes('Add link'));
test('mobile Add reveals expanded fields smoothly and repeat taps create only one unfinished link',()=>{
 const h=harness();let tree=h.render();add(tree).props.onClick();add(tree).props.onClick();assert.equal(h.adds,1);
 tree=h.render();assert.equal(nodes(tree).find(n=>n.props.link?.id==='new-1').props.isExpanded,true);h.flush();
 assert.deepEqual(h.scrolls,[{id:'profile-link-details-new-1',behavior:'smooth',block:'start'}]);
 add(h.render()).props.onClick();h.render();h.flush();assert.equal(h.adds,1);
 h.links[1].label='New destination';add(h.render()).props.onClick();assert.equal(h.adds,2);
});
test('reduced motion reveals without animation; WEB retains existing Add behavior',()=>{
 const mobile=harness({reduce:true});add(mobile.render()).props.onClick();mobile.render();mobile.flush();assert.equal(mobile.scrolls[0].behavior,'instant');
 const web=harness({mobile:false});add(web.render()).props.onClick();add(web.render()).props.onClick();web.render();web.flush();assert.equal(web.adds,2);assert.equal(web.scrolls.length,0);
});
test('every portal icon is accepted for saved links, and a new icon survives link normalization',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../src/data/portal-icon-catalog.json',import.meta.url),'utf8'));
 const icons={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/profile/categoryIcons.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports:icons,require:id=>id==='react'?React:id.endsWith('portal-icon-catalog.json')?catalog:new Proxy({},{get:(_,key)=>key})});
 assert.ok(icons.portalIconNames.length>1000);
 for(const name of icons.portalIconNames)assert.ok(icons.profileLinkIconNames.includes(name),name);
 const helpers={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/profile/profileLinks.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:helpers,require:()=>icons});
 const link=helpers.normalizeProfileLink({label:'Access guide',href:'https://example.com',iconName:'lucide:accessibility'});
 assert.equal(link.iconName,'lucide:accessibility');
 assert.equal(helpers.normalizeProfileLink({...link,iconName:'not-a-real-icon'}).iconName,'globe');
});
