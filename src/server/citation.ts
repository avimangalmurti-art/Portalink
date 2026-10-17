import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import {citationJsonLd,citationLicense,plainCitation,type CitationItem} from '../features/citations/model';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function citationError(request: Request, assets: {fetch(request: Request): Promise<Response>}, status: number, kind: 'not-found' | 'network') {
 const response=await assets.fetch(new Request(new URL('/cite',request.url),request));
 const html=(await response.text()).replace('<!--CITATION_HEAD-->',`<script>window.__PORTALINK_CITATION_ERROR__=${JSON.stringify(kind)}</script>`).replace('<!--CITATION_BODY-->',`<main><h1>${kind==='network'?'Connection unavailable':'Page not found'}</h1><p>${kind==='network'?'This page could not be loaded.':'This page may have been moved or removed.'}</p><a href="/">Go to Home</a></main>`);
 return new Response(request.method==='HEAD'?null:html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export async function handleCitation(request:Request,assets:{fetch(request:Request):Promise<Response>},config:{supabaseUrl:string;publishableKey:string},fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(request.url),headers={'apikey':config.publishableKey,'authorization':`Bearer ${config.publishableKey}`,'content-type':'application/json'};
 let id:string;try{id=decodeURIComponent(url.pathname.slice(6));if(!id||id.length>2048)throw Error();}catch{return citationError(request,assets,404,'not-found');}
 try{
 const result=await fetcher(`${config.supabaseUrl}/rest/v1/rpc/resolve_citation_item`,{method:'POST',headers,body:JSON.stringify({p_item_id:id,p_require_citable:false})});
 if(!result.ok)return citationError(request,assets,503,'network');
 const item=await result.json() as CitationItem|null;
 if(item)item.citable=false;if(!item)return citationError(request,assets,404,'not-found');
 const response=await assets.fetch(new Request(new URL('/cite',request.url),request));
 let html=await response.text();
 const license=citationLicense(PUBLIC_ORIGIN,item.citable),json=JSON.stringify(citationJsonLd(item,PUBLIC_ORIGIN)).replace(/</g,'\\u003c');
 html=html.replace('<!--CITATION_HEAD-->',`<link rel="license" href="${escape(license)}"><script type="application/ld+json">${json}</script>`).replace('<!--CITATION_BODY-->',`<main><h1>${escape(item.projectTitle)}</h1><blockquote>${escape(plainCitation(item,PUBLIC_ORIGIN))}</blockquote>${item.citable?'':'<p>View only. The creator has not permitted AI retrieval or reproduction.</p>'}</main>`);
 return new Response(request.method==='HEAD'?null:html,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return citationError(request,assets,503,'network');}
}
export function citationLicenseResponse(path:string):Response|null{
 if(!['/licenses/citable-v1','/licenses/view-only-v1'].includes(path))return null;
 if(path.endsWith('citable-v1')) return new Response('Optional AI retrieval and reproduction are unavailable at launch.',{status:410,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
 const text='Portalink view-only terms v1. Public viewing is permitted. AI retrieval and reproduction permission is not granted by public visibility. Human attribution and citation do not grant reproduction rights.';
 return new Response(text,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});
}
