import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path,globals={}) {const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Blob,URL,TextEncoder,DOMException,setTimeout,clearTimeout,...globals});return exports;}
function fixture(count=3) {
 const renders=[],encoded=[],labels=[],images=[];let destroyed=0;
 const document={createElement(){const canvas={width:0,height:0,getContext:()=>({scale(){},fillRect(){},fillText(value){labels.push(value);},measureText:value=>({width:value.length*6}),drawImage(){}}),toBlob(callback,type){encoded.push([canvas.width,canvas.height]);callback(new Blob(['mock JPEG pixels'],{type}));}};return canvas;}};
 class Image {naturalWidth=900;naturalHeight=1200;set src(value){if(value){images.push(value);queueMicrotask(()=>value==='broken-thumbnail.webp'?this.onerror?.():this.onload?.());}}}
 const pdf={numPages:count,getPage:async()=>({getViewport:({scale})=>({width:612*scale,height:792*scale}),render:({viewport})=>{renders.push(viewport);return{promise:Promise.resolve()};},cleanup(){}})};
 const employer=load('src/features/employer/employer.ts'),assembler=load('src/features/employer/jpegPdf.ts');
 const renderer=load('src/features/employer/portfolioPdf.ts',{document,Image,require:name=>({
   'lean-qr':{generate:()=>({size:21,get:()=>true})},'./employer':employer,'./jpegPdf':assembler,
   '../journey/journey':{projectMonth:()=> '2024-05',learnedLine:()=> 'A lesson learned'},
   '../../components/media/PdfPage':{pdfSourceOptions:source=>({url:source}),loadPdfJs:async()=>({getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>{destroyed++;}})})}
 }[name])});
 return{...renderer,renders,encoded,labels,images,get destroyed(){return destroyed;}};
}
const profile={name:'Mira Chen',headline:'Designer',location:'London',projects:[]};
const pdfProject={id:'pdf',title:'Study',cover:'original.pdf',attachments:[{sourceUrl:'original.pdf',kind:'document',mimeType:'application/pdf',extension:'pdf',displayName:'Study.pdf',order:0}]};
test('renderer assembles true PDF pages plus images at at most 150dpi, without loading the original PDF as an image',async()=>{
 const f=fixture();const project={id:'images',title:'Photographs',attachments:[{sourceUrl:'image.jpg',kind:'image',displayName:'Image',order:0,sizeBytes:1000}]};
 const blob=await f.createPortfolioPdf(profile,[pdfProject,project],'https://portalink.example/share/creator',new AbortController().signal,()=>{});
 assert.match(await blob.text(),/\/Count 5/);assert.equal(f.renders.length,3);assert.equal(f.destroyed,1);assert.equal(f.encoded.length,5);
 assert.ok(f.encoded.every(([w,h])=>w<=1650&&h<=1650));assert.ok(f.renders.every(viewport=>viewport.width<=1275&&viewport.height<=1650));
 assert.ok(!f.images.includes('original.pdf'));assert.ok(f.images.some(source=>source.startsWith('blob:')));
 assert.ok(f.labels.includes('Study · 2024-05'));assert.ok(f.labels.includes('A lesson learned'));
});
test('catalog page count enforces the 120-page limit before rasterization and always destroys the loader',async()=>{
 const f=fixture(120);await assert.rejects(f.createPortfolioPdf(profile,[pdfProject],'https://example.com',new AbortController().signal,()=>{}),/exceeds 120/);
 assert.equal(f.renders.length,0);assert.equal(f.destroyed,1);
});
test('a failed thumbnail uses the already rendered first page without failing the portfolio',async()=>{
 const f=fixture(1),project={...pdfProject,coverThumbnail:{variants:[{size:400,sourceUrl:'broken-thumbnail.webp'}]}};
 const blob=await f.createPortfolioPdf(profile,[project],'https://example.com',new AbortController().signal,()=>{});
 assert.match(await blob.text(),/\/Count 2/);assert.ok(f.images.includes('broken-thumbnail.webp'));assert.ok(f.images.some(source=>source.startsWith('blob:')));
});
test('pre-aborted jobs and oversized images cannot begin page rendering',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(f.createPortfolioPdf(profile,[pdfProject],'https://example.com',controller.signal,()=>{}),{name:'AbortError'});assert.equal(f.renders.length,0);
 const project={id:'huge',title:'Huge',attachments:[{sourceUrl:'huge.jpg',kind:'image',displayName:'Huge',order:0,sizeBytes:1000,metadata:{widthPixels:10000,heightPixels:10000}}]};
 await assert.rejects(f.createPortfolioPdf(profile,[project],'https://example.com',new AbortController().signal,()=>{}),/too large/);assert.equal(f.images.length,0);
});
