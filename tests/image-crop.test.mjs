import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...globals });
  return exports;
}
const cropper = load('../src/utils/imageCrop.ts');
const frame = load('../src/utils/coverFrame.ts');
const presentation = load('../src/utils/projectPresentation.ts');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('portrait, landscape and square images cover every viewport at 100–300%', () => {
  for (const size of [{width:4000,height:1000}, {width:1000,height:4000}, {width:800,height:800}]) {
    for (const ratio of [1, 16/9, 4/3, 3]) for (const zoom of [1, 1.5, 3]) for (const x of [0, .25, 1]) for (const y of [0, .75, 1]) {
      const crop = cropper.cropFromPosition(size, ratio, {x,y,zoom});
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1.000000001 && crop.y + crop.height <= 1.000000001);
      near(crop.width * size.width / (crop.height * size.height), ratio);
      const position = cropper.positionFromCrop(crop);
      if (crop.width < 1) near(position.x,x);
      if (crop.height < 1) near(position.y,y);
      near(position.zoom,zoom);
    }
  }
});

test('pan follows the pointer and clamps to all four source edges', () => {
  const size={width:2400,height:1600}, viewport={width:480,height:270}, start={x:.5,y:.5,zoom:2};
  const before=cropper.cropFromPosition(size,16/9,start);
  const moved=cropper.panImage(start,size,viewport,20,10);
  const after=cropper.cropFromPosition(size,16/9,moved);
  near(after.x,before.x - 20/480 * before.width);
  near(after.y,before.y - 10/270 * before.height);
  for (const delta of [-100000,100000]) {
    const edge=cropper.cropFromPosition(size,16/9,cropper.panImage(start,size,viewport,delta,delta));
    near(edge.x,delta>0?0:1-edge.width);
    near(edge.y,delta>0?0:1-edge.height);
  }
});

test('wheel zoom keeps the pixel under the pointer in place and clamps zoom', () => {
  const size={width:1800,height:1200}, start={x:.5,y:.5,zoom:1.5}, anchor={x:.2,y:.8};
  const a=cropper.cropFromPosition(size,16/9,start);
  const b=cropper.cropFromPosition(size,16/9,cropper.zoomImage(start,size,16/9,2.4,anchor));
  near(a.x + anchor.x*a.width,b.x + anchor.x*b.width);
  near(a.y + anchor.y*a.height,b.y + anchor.y*b.height);
  assert.equal(cropper.zoomImage(start,size,1,100).zoom,3);
  assert.equal(cropper.zoomImage(start,size,1,0).zoom,1);
});

test('CSS object-position/scale and exported source rectangles describe the same pixels', () => {
  const size={width:3200,height:2100}, viewport={width:640,height:360}, position={x:.27,y:.81,zoom:2.3};
  const crop=cropper.cropFromPosition(size,16/9,position);
  const pixels=cropper.sourceCropPixels(size,crop);
  const coverScale=Math.max(viewport.width/size.width,viewport.height/size.height);
  near(pixels.x, (size.width*coverScale*position.zoom-viewport.width)*position.x/(coverScale*position.zoom));
  near(pixels.y, (size.height*coverScale*position.zoom-viewport.height)*position.y/(coverScale*position.zoom));
  const small=cropper.cropFromPosition(size,320/180,position);
  assert.deepEqual(small,crop);
  assert.match(cropper.imagePositionStyle(position).objectPosition,/27% 81%/);
});

test('new crop metadata survives normalization while legacy project ratios stay unchanged', () => {
  const crop=cropper.cropFromPosition({width:2400,height:1600},16/9,{x:.3,y:.7,zoom:2});
  const saved=frame.normalizeProjectCoverFrame({x:.3,y:.7,zoom:2,aspectRatio:16/9,crop});
  near(saved.crop.width,crop.width);
  near(saved.aspectRatio,16/9);
  assert.equal(presentation.getProjectAspectRatio({coverAspectRatio:1.5,coverFrame:saved}),16/9);
  assert.equal(presentation.getProjectAspectRatio({coverKind:'document',coverOrientation:'portrait',coverFrame:saved}),16/9);
  assert.equal(presentation.getProjectAspectRatio({pageCount:8,coverOrientation:'portrait',coverFrame:saved}),16/9);
  assert.equal(presentation.getProjectAspectRatio({coverKind:'document',coverOrientation:'portrait'}),1/1.414);
  assert.equal(presentation.getProjectAspectRatio({coverKind:'document',coverOrientation:'landscape',coverFrame:{aspectRatio:Infinity}}),1.414);
  assert.equal(presentation.getProjectAspectRatio({coverAspectRatio:1.5}),1.5);
  assert.equal(frame.normalizeProjectCoverFrame({x:Infinity,y:-10,zoom:20}).zoom,3);
  assert.equal(frame.normalizeProjectCoverFrame({x:.5,y:.5,zoom:1,crop:{x:2,y:0,width:1,height:1,zoom:1}}).crop,undefined);
});

test('export draws exactly the preview rectangle and returns the Blob and bounded canvas', async () => {
  let draw;
  const canvas={width:0,height:0,getContext:()=>({drawImage:(...args)=>{draw=args;}}),toBlob:(done)=>done(new Blob(['crop'],{type:'image/webp'}))};
  const module=load('../src/utils/imageCrop.ts',{Blob,document:{createElement:()=>canvas}});
  const image={naturalWidth:4000,naturalHeight:6000};
  const crop=module.cropFromPosition({width:4000,height:6000},2/3,{x:.5,y:.5,zoom:1});
  const result=await module.renderImageCrop(image,crop,{outputWidth:4096});
  assert.ok(result.blob.size>0);
  assert.equal(result.canvas,canvas);
  assert.ok(canvas.width<=4096 && canvas.height<=4096);
  assert.deepEqual(draw.slice(1,5),[0,0,4000,6000]);
  await assert.rejects(module.renderImageCrop({naturalWidth:0,naturalHeight:0},crop),/not loaded/);
  await assert.rejects(module.renderImageCrop({naturalWidth:1,naturalHeight:10000},{x:0,y:0,width:1,height:1,zoom:1}),/less narrow/);
});

test('a canvas export failure rejects without claiming a saved image', async () => {
  const canvas={getContext:()=>({drawImage(){}}),toBlob(){throw new Error('SecurityError');}};
  const module=load('../src/utils/imageCrop.ts',{document:{createElement:()=>canvas}});
  await assert.rejects(module.renderImageCrop({naturalWidth:800,naturalHeight:800},{x:0,y:0,width:1,height:1,zoom:1}),/Choose an image file/);
});
