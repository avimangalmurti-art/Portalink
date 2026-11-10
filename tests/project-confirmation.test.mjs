import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import ts from 'typescript';import vm from 'node:vm';import{readFileSync}from'node:fs';
import { sourceModule } from './helpers/source-module.mjs';
const code=ts.transpileModule(readFileSync(new URL('../src/features/projects/ProjectEditorDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
test('project confirmation never deletes on entry/cancel and closes only after confirmed service success',async()=>{
 const exports={},calls=[];let success=false;
 vm.runInNewContext(code,{exports,React,require(name){if(name==='react')return React;if(name.endsWith('/ConfirmationDialog'))return{ConfirmationDialog:'confirmation'};return new Proxy({},{get:()=>()=>null});}});
 const management={deletion:{projectId:'work',phase:'confirming',isDeleting:false,failure:null,cancel:()=>calls.push('cancel'),confirm:async()=>{calls.push('delete');return success;}}};
 const tree=exports.DeleteProjectDialog({management,projectTitle:'Actual work',onDeleted:()=>calls.push('leave')});assert.equal(tree.type,'confirmation');assert.deepEqual(calls,[]);tree.props.onCancel();assert.deepEqual(calls,['cancel']);assert.equal(await tree.props.onConfirm(),false);assert.deepEqual(calls,['cancel','delete']);success=true;assert.equal(await tree.props.onConfirm(),true);assert.deepEqual(calls,['cancel','delete','delete','leave']);
});
test('dirty profile Back preserves editor state until explicit discard', t => {
  let cursor = 0, closed = 0;
  const slots = [], layouts = [];
  const react = {
    ...React,
    useEffect() {},
    useCallback: callback => callback,
    useLayoutEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      layouts.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
  };
  const window = {
    history: { state: { idx: 1 } }, location: { href: 'https://portalink.example/profile/edit' },
    addEventListener() {}, removeEventListener() {}, setTimeout: () => 1, clearTimeout() {},
  };
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  const globals = { window, document, HTMLElement: class {}, requestAnimationFrame: () => 1 };
  const leaveGuard = sourceModule('src/features/profile/profileLeaveGuard.ts', {
    '../../hooks/useModalFocus': { dismissTopModal: () => false },
  }, globals);
  const leaveHook = sourceModule('src/features/profile/useProfileLeaveGuard.ts', {
    react, './profileLeaveGuard': leaveGuard,
  }, globals);
  const draft = {
    phase: 'ready', isDirty: true, canSave: false, fields: { name: 'Draft name', links: [] },
    linkErrors: {}, avatar: { error: null }, save: { reset() {} },
  };
  const { ProfileEditorPage } = sourceModule('src/features/profile/ProfileEditorDialog.tsx', {
    react, './useProfileLeaveGuard': leaveHook, './useProfileEditor': { useProfileEditor: () => draft },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'owner' } }) },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back', useMobileScreenActive: () => true },
    '../../components/ui/ConfirmationDialog': { ConfirmationDialog: 'confirmation' },
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../components/ui/StateViews': { ErrorState: 'error', LoadingState: 'loading' },
    './ProfilePersonalDetails': { ProfilePersonalDetails: 'personal-details' }, './ProfileLinkDetails': { ProfileLinkDetails: 'link-details' },
    './ProfileLinksEditor': { ProfileLinksEditor: 'links-editor' }, './validation': {}, './profileEditorPage.css': {},
    'lucide-react': { ChevronRightIcon: 'chevron-right' },
  }, globals);
  t.after(() => slots.forEach(slot => slot?.cleanup?.()));
  const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
  const render = () => {
    cursor = 0;
    const tree = ProfileEditorPage({ profileId: 'owner', onClose: () => closed++, onSaved: () => assert.fail('Back must not save') });
    layouts.splice(0).forEach(effect => effect());
    return nodes(tree);
  };
  const back = () => render().find(node => node.props['aria-label'] === 'Back').props.onClick();
  const confirmation = () => render().find(node => node.type === 'confirmation');

  back();
  const prompt = confirmation();
  assert.equal(prompt.props.title, 'Discard changes?');
  assert.equal(closed, 0);
  prompt.props.onCancel();
  assert.equal(confirmation(), undefined);
  assert.ok(render().some(node => node.props['aria-label'] === 'Personal details, Draft name'));
  assert.equal(closed, 0);
  back();
  confirmation().props.onConfirm();
  assert.equal(closed, 1);
});
