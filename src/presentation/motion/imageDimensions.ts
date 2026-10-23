/** Read intrinsic geometry before a standalone preview enters the layout. */
export async function imageDimensions(source:string):Promise<{width:number;height:number}|null>{
 const image=new Image();
 const loaded=new Promise<void>(resolve=>{image.onload=()=>resolve();image.onerror=()=>resolve();});
 image.src=source;
 if(typeof image.decode==='function')await image.decode().catch(()=>undefined);else await loaded;
 return image.naturalWidth>0&&image.naturalHeight>0?{width:image.naturalWidth,height:image.naturalHeight}:null;
}
