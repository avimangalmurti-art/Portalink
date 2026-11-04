import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Run the real component's handlers and effects with a controlled image/canvas lifecycle. */
function editorHarness(options = {}) {
  const slots=[];
  let cursor=0,dirty=true,tree,effects=[],props={source:'https://images.test/original.jpg',alt:'Cover',startEditing:true,onSave(){},...options};
  let failExport=false,holdExport=false;
  const exportsWaiting=[];
  const nodes=new Map();
  const react={
    useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,(v)=>{const n=typeof v==='function'?v(slots[i].value):v;if(!Object.is(n,slots[i].value)){slots[i].value=n;dirty=true;}}];},
    useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i];},
    useId(){const i=cursor++;return `id-${i}`;},
    useCallback(callback){const i=cursor++;slots[i]??={callback};return slots[i].callback;},
    useEffect(effect,deps){const i=cursor++,prior=slots[i];if(!prior||!deps.every((v,k)=>Object.is(v,prior.deps[k]))){slots[i]={deps};effects.push(()=>{prior?.cleanup?.();slots[i].cleanup=effect();});}},
  };
  class LoadedImage {
    naturalWidth=2400;naturalHeight=1600;
    set src(value){this.url=value;Promise.resolve().then(()=>this.onload?.());}
    get src(){return this.url;}
  }
  const canvas=()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(done){if(failExport)throw Error('SecurityError');const finish=()=>done(new Blob(['pixels'],{type:'image/webp'}));if(holdExport)exportsWaiting.push(finish);else finish();}});
  const globals={Blob,Image:LoadedImage,URL,ResizeObserver:class{observe(){}disconnect(){}},document:{createElement:()=>canvas()}};
  function load(path,require){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require,...globals});return exports;}
  const geometry=load('../src/utils/imageCrop.ts');
  const pinchGesture=load('../src/utils/pinchGesture.ts');
  const Component=load('../src/components/media/ImageRepositioner.tsx',(name)=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'Fragment'};
    if(name==='lucide-react')return {MoveIcon:'Move',RotateCcwIcon:'Reset'};
    if(name.endsWith('/imageCrop'))return geometry;
    if(name.endsWith('/pinchGesture'))return pinchGesture;
    if(name.endsWith('/Button'))return {Button:'Button'};
    if(name.endsWith('/InterfaceIcon'))return {InterfaceIcon:'Icon'};
    throw Error(name);
  }).ImageRepositioner;
  function walk(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=walk(child,predicate);if(found)return found;}return null;}if(predicate(node))return node;return walk(node.props?.children,predicate);}
  function render(){cursor=0;dirty=false;effects=[];tree=Component(props);walk(tree,(node)=>{const ref=node.props?.ref;if(ref){if(!nodes.has(ref))nodes.set(ref,{getBoundingClientRect:()=>({width:640,height:360,left:0,top:0}),addEventListener(){},removeEventListener(){},focus(){},setPointerCapture(){},hasPointerCapture(){return false;}});ref.current=nodes.get(ref);}return false;});for(const effect of effects)effect();}
  async function flush(){for(let i=0;i<40;i++){if(dirty)render();await Promise.resolve();}}
  const text=(node)=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
  return {
    flush,
    find:(predicate)=>{if(dirty)render();return walk(tree,predicate);},
    button(label){if(dirty)render();return walk(tree,(node)=>node.type==='Button'&&text(node)===label);},
    zoom(value){if(dirty)render();walk(tree,(node)=>node.type==='input').props.onChange({currentTarget:{value:String(value)}});},
    touch(handler, id, x, y) {
      if (dirty) render();
      const viewport = walk(tree, node => node.props?.className?.includes('image-reposition-viewport'));
      viewport.props[handler]({ pointerId: id, pointerType: 'touch', isPrimary: id === 1, button: 0,
        clientX: x, clientY: y, preventDefault() {}, currentTarget: viewport.props.ref.current });
    },
    options(next){props={...props,...next};dirty=true;},
    failExport(){failExport=true;},
    holdExport(){holdExport=true;},
    finishExport(){exportsWaiting.splice(0).forEach((finish)=>finish());},
    dispose(){for(const slot of slots)slot?.cleanup?.();},
  };
}

test('Cancel discards the draft; reopening restores the last saved position', async () => {
  const saves=[];let cancels=0;
  const editor=editorHarness({initialPosition:{x:.5,y:.5,zoom:1.5},onSave:(result)=>saves.push(result),onCancel:()=>cancels++});
  await editor.flush();editor.zoom(2.8);await editor.flush();
  editor.button('Cancel').props.onClick();await editor.flush();
  assert.equal(cancels,1);assert.equal(saves.length,0);
  editor.button('Reposition').props.onClick();await editor.flush();
  assert.equal(editor.find((node)=>node.type==='input').props.value,1.5);
  editor.dispose();
});

test('the shared image editor keeps default Save and desktop instructions for unscoped callers',async()=>{
 const editor=editorHarness();await editor.flush();
 assert.ok(editor.button('Save'));
 assert.ok(editor.find(node=>node.type==='p'&&node.props.children==='Drag to reposition. Scroll or use the slider to zoom. Arrow keys make small adjustments.'));
 editor.dispose();
});

test('Save exports the current crop once and keeps it when Reposition opens again', async () => {
  const saves=[];const editor=editorHarness({onSave:(result)=>saves.push(result)});
  await editor.flush();editor.zoom(2);await editor.flush();
  editor.button('Save').props.onClick();await editor.flush();
  assert.equal(saves.length,1);assert.equal(saves[0].crop.zoom,2);assert.ok(saves[0].blob.size>0);
  editor.button('Reposition').props.onClick();await editor.flush();
  assert.equal(editor.find((node)=>node.type==='input').props.value,2);
  editor.dispose();
});

test('a mobile pinch zooms around the moving fingers and resumes dragging when either finger lifts', async () => {
  const saves = [];
  const editor = editorHarness({ pinchToZoom: true, initialPosition: { x: .5, y: .5, zoom: 1.5 }, onSave: result => saves.push(result) });
  await editor.flush();
  editor.touch('onPointerDown', 1, 220, 160);
  editor.touch('onPointerDown', 2, 300, 160);
  editor.touch('onPointerMove', 1, 210, 175);
  editor.touch('onPointerMove', 2, 330, 175);
  await editor.flush();
  assert.equal(editor.find(node => node.type === 'input').props.value, 2.25);
  const imageLeft = () => Number.parseFloat(editor.find(node => node.type === 'img').props.style.left);
  const beforeRelease = imageLeft();
  editor.touch('onPointerUp', 1, 210, 175);
  editor.touch('onLostPointerCapture', 1, 210, 175);
  assert.equal(imageLeft(), beforeRelease);
  editor.touch('onPointerMove', 2, 350, 175);
  assert.ok(Math.abs(imageLeft() - beforeRelease - 100 * 20 / 640) < 1e-9);
  editor.touch('onPointerCancel', 2, 350, 175);
  assert.equal(saves.length, 0);
  editor.button('Save').props.onClick();
  await editor.flush();
  assert.equal(saves[0].crop.zoom, 2.25);
  editor.dispose();
});

test('failed export keeps the crop editable and never invokes Save', async () => {
  const saves=[];const editor=editorHarness({onSave:(result)=>saves.push(result)});
  await editor.flush();editor.failExport();editor.button('Save').props.onClick();await editor.flush();
  assert.equal(saves.length,0);assert.ok(editor.button('Save'));assert.ok(editor.find((node)=>node.props?.role==='alert'));
  editor.dispose();
});

test('changing preview shape preserves unsaved zoom and exports the new aspect ratio', async () => {
  const saves=[]; const editor=editorHarness({aspectRatio:1,onSave:(result)=>saves.push(result)});
  await editor.flush(); editor.zoom(2.4); await editor.flush();
  editor.options({aspectRatio:16/9}); await editor.flush();
  assert.equal(editor.find((node)=>node.type==='input').props.value,2.4);
  editor.button('Save').props.onClick(); await editor.flush();
  assert.equal(saves.length,1);
  const {crop,sourceSize}=saves[0];
  assert.ok(Math.abs(crop.width*sourceSize.width/(crop.height*sourceSize.height)-16/9)<1e-9);
  editor.dispose();
});

test('an export finishing after source replacement cannot save the previous image', async () => {
  const saves=[];const editor=editorHarness({onSave:(result)=>saves.push(result)});
  await editor.flush();editor.holdExport();editor.button('Save').props.onClick();await editor.flush();
  editor.options({source:'https://images.test/replacement.jpg'});await editor.flush();editor.finishExport();await editor.flush();
  assert.equal(saves.length,0);assert.equal(editor.find((node)=>node.type==='input').props.value,1);
  editor.dispose();
});

test('async Save stays busy and cannot Cancel until the caller finishes', async () => {
  let finish; let cancels=0; const changes=[];
  const editor=editorHarness({onSave:()=>new Promise((resolve)=>{finish=resolve;}),onCancel:()=>cancels++,onSavingChange:(value)=>changes.push(value)});
  await editor.flush();editor.button('Save').props.onClick();await editor.flush();
  assert.equal(editor.button('Cancel').props.disabled,true);
  editor.button('Cancel').props.onClick();assert.equal(cancels,0);
  assert.equal(changes.at(-1),true);
  finish();await editor.flush();assert.equal(changes.at(-1),false);assert.ok(editor.button('Reposition'));
  editor.dispose();
});

test('dialog guards X, backdrop and Escape for the entire Save', () => {
 for(const {presentation,mobileAuthoring} of [{presentation:'mobile',mobileAuthoring:true},{presentation:'web',mobileAuthoring:true},{presentation:'mobile',mobileAuthoring:false}]){
  const slots=[]; let cursor=0,escape,closed=0;
  const react={
    useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},
    useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,(v)=>{slots[i].value=v;}];},
    useId(){cursor++;return 'heading';},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/ImageRepositionDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require(name){
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    if(name==='lucide-react')return {XIcon:'X'};
    if(name.endsWith('/useModalFocus'))return {useModalFocus:(_open,_ref,fn)=>{escape=fn;}};
    if(name.endsWith('/useDialogViewport'))return {useDialogViewport:()=>({current:null})};
    if(name.endsWith('/usePresentation'))return {usePresentation:()=>presentation};
    if(name.endsWith('.css'))return {};
    if(name.endsWith('/InterfaceIcon'))return {InterfaceIcon:'Icon'};
    if(name.endsWith('/ModalPortal'))return {ModalPortal:'Portal'};
    if(name==='./ImageRepositioner')return {ImageRepositioner:'Editor'};
    if(name.endsWith('/StateViews'))return {LoadingState:'Loading',ErrorState:'Error'};
    throw Error(name);
  }});
  const render=()=>{cursor=0;const portal=exports.ImageRepositionDialog({title:'Cover',mobileAuthoring,onClose:()=>closed++,source:'image.jpg',alt:'Cover',controls:'Shape',onSave(){}});return portal.props.children.find(child=>child?.props?.className?.includes('image-reposition-overlay'));};
  let backdrop=render();let dialog=backdrop.props.children;
  const child=dialog.props.children[1].props.children.props.children[1];
  const authoring=presentation==='mobile'&&mobileAuthoring;
  assert.equal(backdrop.props['data-mobile-upload-surface'],authoring?'cover':undefined);
  assert.equal(child.props.pinchToZoom,authoring);
  assert.equal(child.props.instructions,authoring?'Drag to reposition. Pinch or use the slider to zoom.':undefined);
  assert.equal(child.props.saveLabel,authoring?'Save cover':undefined);
  child.props.onSavingChange(true);
  backdrop=render();dialog=backdrop.props.children;
  const close=dialog.props.children[0].props.children[1];
  assert.equal(close.props.disabled,true);
  assert.equal(dialog.props.children[1].props.children.props.children[0].props.disabled,true);
  close.props.onClick();backdrop.props.onMouseDown({target:backdrop,currentTarget:backdrop});escape();assert.equal(closed,0);
  child.props.onSavingChange(false);backdrop=render();
  escape();assert.equal(closed,1);
 }
});
