import React, {useEffect, useRef, useState} from 'react';
import {queuePageRender} from './pageRenderQueue';
import {useMobileMediaRecovery} from './useMobileMediaRecovery';
/** Dense mobile grids keep display-sized canvases, not every original decoded image. */
export function DocumentGridPreview({source, width, height, label, onReady}: {source:string; width:number; height:number; label:string; onReady:()=>void}) {
 const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), ready = useRef(onReady);
 const paintedSource = useRef<string | null>(null), currentSource = useRef(source);
 currentSource.current = source;
 ready.current = onReady;
 const [near, setNear] = useState(false), [revision, setRevision] = useState(0), [painted, setPainted] = useState(false), [failed,setFailed] = useState(false), [loading, setLoading] = useState(false);
 const ratio = width > 0 && height > 0 ? width / height : 8.5 / 11;
 useMobileMediaRecovery({hostRef:host, identity:source, enabled:near, failed, loading, onRetry:() => {setFailed(false); setRevision(value => value + 1);}});
 useEffect(() => {
  paintedSource.current = null;
  setPainted(false); setFailed(false);
  if (canvas.current) {canvas.current.width = 0; canvas.current.height = 0;}
 }, [source]);
 useEffect(() => {
  const target = canvas.current;
  return () => {if (target) {target.width = 0; target.height = 0;}};
 }, []);
 useEffect(() => {
  const element = host.current; if (!element) return;
  if (typeof IntersectionObserver === 'undefined') {setNear(true); return;}
  const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {rootMargin:'120px 0px'});
  observer.observe(element); return () => observer.disconnect();
 }, []);
 useEffect(() => {
  if (!near || !host.current || typeof ResizeObserver === 'undefined') return;
  let timer: ReturnType<typeof setTimeout>;
  const observer = new ResizeObserver(() => {clearTimeout(timer); timer = setTimeout(() => setRevision(value => value + 1), 120);});
  observer.observe(host.current); return () => {clearTimeout(timer); observer.disconnect();};
 }, [near]);
 useEffect(() => {
  const element = host.current, target = canvas.current;
  if (!element || !target) return;
  const hasArtwork = paintedSource.current === source && target.width > 0;
  setFailed(false);
  if (!hasArtwork) {setPainted(false); element.closest('[data-project-page-number]')?.setAttribute('data-project-page-ready','false');}
  if (!near) {target.width = 0; target.height = 0; paintedSource.current = null; setPainted(false); setLoading(false); return;}
  setLoading(true);
  const controller = new AbortController();
  let disposed = false;
  let bitmap: ImageBitmap | null = null, image: HTMLImageElement | null = null, url: string | null = null;
  const release = () => {bitmap?.close(); bitmap = null; if (image) {image.src = ''; image = null;} if (url) {URL.revokeObjectURL(url); url = null;}};
  const job = queuePageRender(() => {const timeout = setTimeout(()=>controller.abort(),20_000); return {cancel:() => controller.abort(), promise:(async () => {
   const cssWidth = element.clientWidth;
   if (cssWidth <= 0) return;
   const outputWidth = Math.max(1,Math.floor(Math.min(cssWidth * Math.min(2,window.devicePixelRatio || 1),512,2048 * ratio)));
   const outputHeight = Math.max(1,Math.floor(Math.min(2048,outputWidth / ratio)));
   let blob: Blob | null = null;
   try {const response = await fetch(source,{signal:controller.signal}); if (!response.ok) throw new Error('Page preview unavailable'); blob = await response.blob();}
   catch(error) {if(controller.signal.aborted) throw error;} // Image display remains available when CORS forbids fetch.
   if (disposed || controller.signal.aborted || currentSource.current !== source) return;
   if (blob && typeof createImageBitmap === 'function') {
    try {bitmap = await createImageBitmap(blob,{resizeWidth:outputWidth,resizeHeight:outputHeight,resizeQuality:'high'});} catch {if (controller.signal.aborted) return;}
   }
   if (!bitmap) {
    const candidate = new Image(); image=candidate; if(blob)url = URL.createObjectURL(blob); candidate.src = url ?? source;
    await new Promise<void>((resolve,reject) => {if (candidate.complete && candidate.naturalWidth) resolve(); else {candidate.onload=()=>resolve(); candidate.onerror=()=>reject(new Error('Page preview unavailable')); controller.signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true});}});
   }
   if (disposed || controller.signal.aborted || currentSource.current !== source) return;
   // Decode and draw into a staging canvas before replacing any painted artwork.
   const staging = document.createElement('canvas'); staging.width=outputWidth; staging.height=outputHeight;
   try {
    const stagingContext=staging.getContext('2d'); if (!stagingContext) throw new Error('Page preview unavailable');
    const pixels = bitmap ?? image; if(!pixels)throw new Error('Page preview unavailable');
    stagingContext.drawImage(pixels,0,0,outputWidth,outputHeight);
    const context=target.getContext('2d'); if (!context) throw new Error('Page preview unavailable');
    target.width=outputWidth; target.height=outputHeight; context.drawImage(staging,0,0);
   } finally {staging.width=0; staging.height=0;}
   paintedSource.current=source;
   element.closest('[data-project-page-number]')?.setAttribute('data-project-page-ready','true');
   setPainted(true); ready.current();
  })().finally(()=>{clearTimeout(timeout);release();})};});
  void job.promise.catch(() => {if(!disposed && currentSource.current === source)setFailed(true);}).finally(() => {
   if(!disposed && currentSource.current === source) {if(controller.signal.aborted)setFailed(true); setLoading(false);}
  });
  return () => {disposed=true;controller.abort(); job.cancel();};
 }, [near,source,ratio,revision]);
 return <div ref={host} data-document-grid-preview="" className="relative w-full bg-white" style={{aspectRatio:ratio}}>
  <canvas ref={canvas} data-media-page-surface="" role="img" aria-label={label} className={`block h-full w-full transition-opacity duration-[var(--m-base)] ${painted?'opacity-100':'opacity-0'}`}/>
  {!painted && !failed && <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true"><span className="premium-media-loading-mark"/></span>}
  {failed && <span className="sr-only">Page image unavailable</span>}
 </div>;
}
