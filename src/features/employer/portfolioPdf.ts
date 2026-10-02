import { generate } from 'lean-qr';
import type { Profile, Project } from '../../types/domain';
import { loadPdfJs, pdfSourceOptions } from '../../components/media/PdfPage';
import { assembleJpegPdf, type JpegPdfPage } from './jpegPdf';
import { PORTFOLIO_PAGE_LIMIT } from './employer';
import { projectMonth, learnedLine } from '../journey/journey';

const DPI = 150 / 72, BYTE_LIMIT = 80 * 1024 * 1024;
function canvas(width: number, height: number) {
  const element=document.createElement('canvas');element.width=Math.round(width*DPI);element.height=Math.round(height*DPI);
  const context=element.getContext('2d');if(!context)throw new Error('This browser cannot create a PDF image.');
  context.scale(DPI,DPI);context.fillStyle='#fff';context.fillRect(0,0,width,height);return {element,context,width,height};
}
function textLines(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words=value.replace(/\s+/g,' ').trim().split(' ');let line='', lines=0;
  for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>width && line){ctx.fillText(line,x,y+lines*lineHeight,width);lines++;line=word;if(lines>=maxLines){return y+lines*lineHeight;}}else line=next;}
  if(line && lines<maxLines){ctx.fillText(line,x,y+lines*lineHeight,width);lines++;}return y+lines*lineHeight;
}
async function jpegPage(page: ReturnType<typeof canvas>): Promise<JpegPdfPage> {
  const blob=await new Promise<Blob>((resolve,reject)=>page.element.toBlob(value=>value?resolve(value):reject(new Error('The PDF page could not be encoded.')),'image/jpeg',0.86));
  const result={jpeg:blob,pixelWidth:page.element.width,pixelHeight:page.element.height,width:page.width,height:page.height};page.element.width=0;page.element.height=0;return result;
}
async function loadImage(source: string, signal: AbortSignal): Promise<HTMLImageElement> {
  const image=new Image();image.crossOrigin='anonymous';
  await new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);image.onload=null;image.onerror=null;if(error){image.src='';reject(error);}else resolve();};
    const abort=()=>finish(new DOMException('Canceled','AbortError'));
    const timer=setTimeout(()=>finish(new Error('An image took too long to load. Try a smaller selection.')),30000);
    image.onload=()=>finish();image.onerror=()=>finish(new Error('A project image could not be read.'));signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}image.src=source;
  });return image;
}
function fit(ctx:CanvasRenderingContext2D, image:CanvasImageSource, width:number,height:number,x:number,y:number,w:number,h:number) {
  const scale=Math.min(w/width,h/height);ctx.drawImage(image,x+(w-width*scale)/2,y+(h-height*scale)/2,width*scale,height*scale);
}
/** Serial rendering, bounded pixels, cancellation and compressed pages only retained. */
export async function createPortfolioPdf(profile:Profile, projects:Project[], url:string, signal:AbortSignal, onProgress:(message:string)=>void):Promise<Blob> {
  if(!projects.length)throw new Error('Choose at least one project.');
  const pages:JpegPdfPage[]=[], firstPages=new Map<string,JpegPdfPage>();let bytes=0;
  const check=()=>{signal.throwIfAborted();};
  const append=async(page:ReturnType<typeof canvas>)=>{
    check();if(pages.length+2>PORTFOLIO_PAGE_LIMIT){page.element.width=0;throw new Error('This selection exceeds 120 pages including the cover. Choose fewer projects.');}
    const result=await jpegPage(page);bytes+=result.jpeg.size;if(bytes>BYTE_LIMIT)throw new Error('This selection is too large for a phone. Choose fewer projects.');pages.push(result);
    onProgress(`Preparing page ${pages.length}…`);await new Promise(resolve=>setTimeout(resolve,0));
  };
  for(const project of projects){
    const firstPageIndex=pages.length;
    check();let first=true;
    const header=(page:ReturnType<typeof canvas>)=>{
      if(!first)return 20;first=false;const c=page.context;c.fillStyle='#111';c.font='bold 18px system-ui';
      const y=textLines(c,`${project.title}${projectMonth(project)?` · ${projectMonth(project)}`:''}`,28,32,page.width-56,22,2);
      c.font='12px system-ui';c.fillStyle='#444';return textLines(c,learnedLine(project),28,y+6,page.width-56,16,2)+16;
    };
    if(!project.attachments?.length)throw new Error(`“${project.title}” has no downloadable pages.`);
    for(const attachment of project.attachments.slice().sort((a,b)=>a.order-b.order)){
      check();if(!attachment.sourceUrl)throw new Error(`“${attachment.displayName}” has no readable source.`);
      if(attachment.kind==='document' && (attachment.mimeType==='application/pdf' || attachment.extension.toLowerCase()==='pdf')){
        const pdfjs=await loadPdfJs();check();const task=pdfjs.getDocument(pdfSourceOptions(attachment.sourceUrl,true));
        const abort=()=>{void task.destroy().catch(()=>undefined);};signal.addEventListener('abort',abort,{once:true});
        const timeout=setTimeout(abort,120000);
        try {const pdf=await task.promise;if(pages.length+pdf.numPages+1>PORTFOLIO_PAGE_LIMIT)throw new Error('This selection exceeds 120 pages including the cover. Choose fewer projects.');
          for(let n=1;n<=pdf.numPages;n++){
            check();const original=await pdf.getPage(n);const base=original.getViewport({scale:1});
            const page=canvas(base.width>base.height?792:612,base.width>base.height?612:792), top=header(page);
            const scale=Math.min((page.width-40)/base.width,(page.height-top-20)/base.height)*DPI;
            const viewport=original.getViewport({scale:Math.min(DPI,scale)}), raster=document.createElement('canvas');raster.width=Math.ceil(viewport.width);raster.height=Math.ceil(viewport.height);
            try{await original.render({canvas:raster,viewport,background:'#fff'}).promise;check();fit(page.context,raster,raster.width,raster.height,20,top,page.width-40,page.height-top-20);await append(page);}
            finally{original.cleanup();raster.width=0;raster.height=0;}
          }
        } finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);await task.destroy().catch(()=>undefined);}
      } else if(attachment.kind==='image'){
        if(attachment.sizeBytes>32*1024*1024 || (attachment.metadata?.widthPixels ?? 0)*(attachment.metadata?.heightPixels ?? 0)>40_000_000)throw new Error(`“${attachment.displayName}” is too large to safely print on this device. Choose a smaller image project.`);
        const image=await loadImage(attachment.sourceUrl,signal);
        try{const page=canvas(image.naturalWidth>image.naturalHeight?792:612,image.naturalWidth>image.naturalHeight?612:792),top=header(page);fit(page.context,image,image.naturalWidth,image.naturalHeight,20,top,page.width-40,page.height-top-20);await append(page);}finally{image.src='';}
      } else throw new Error(`“${attachment.displayName}” cannot be printed as pages. Choose projects containing PDFs or images.`);
    }
    firstPages.set(project.id,pages[firstPageIndex]);
  }
  check();onProgress('Preparing the portfolio cover…');
  const cover=canvas(612,792),c=cover.context;c.fillStyle='#666';c.font='12px system-ui';c.fillText(`PORTFOLIO · ${new Date().getFullYear()}`,36,48);
  c.fillStyle='#111';c.font='bold 28px system-ui';const y=textLines(c,profile.name,36,95,540,34,2);
  c.font='12px system-ui';c.fillStyle='#555';textLines(c,profile.location ?? '',36,y+14,540,18,2);
  const coverTop=Math.max(235,y+70);
  for(const [index,project] of projects.slice(0,3).entries()){
    const thumbnail=project.coverThumbnail?.variants.find(v=>v.size===400)?.sourceUrl;
    const firstPage=firstPages.get(project.id);
    if(!thumbnail && !firstPage)continue;
    let fallback:string|null=null;
    check();
    try {
      let image:HTMLImageElement;
      try {
        if(!thumbnail)throw new Error('No thumbnail');
        image=await loadImage(thumbnail,signal);
      } catch(error) {
        check();
        if(!firstPage)throw error;
        fallback=URL.createObjectURL(firstPage.jpeg);
        image=await loadImage(fallback,signal);
      }
      try{fit(c,image,image.naturalWidth,image.naturalHeight,36+index*182,coverTop,168,220);}finally{image.src='';}
    } finally { if(fallback)URL.revokeObjectURL(fallback); }
  }
  c.fillStyle='#333';c.font='14px system-ui';c.fillText(`${projects.length} selected projects · ${pages.length+1} pages including this cover`,36,Math.max(510,coverTop+252),540);
  c.font='12px system-ui';textLines(c,`Live portfolio: ${url}`,36,658,420,17,4);
  const qr=generate(url),size=qr.size+8,unit=108/size;c.fillStyle='#fff';c.fillRect(468,636,108,108);c.fillStyle='#000';
  for(let row=0;row<qr.size;row++)for(let col=0;col<qr.size;col++)if(qr.get(col,row))c.fillRect(468+(col+4)*unit,636+(row+4)*unit,unit+.05,unit+.05);
  check();return assembleJpegPdf([await jpegPage(cover),...pages],url);
}
