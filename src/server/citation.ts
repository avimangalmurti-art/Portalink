import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import {citationJsonLd,citationLicense,plainCitation,type CitationItem} from '../features/citations/model';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function handleCitation(request:Request,assets:{fetch(request:Request):Promise<Response>},config:{supabaseUrl:string;publishableKey:string},fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(request.url),headers={'apikey':config.publishableKey,'authorization':`Bearer ${config.publishableKey}`,'content-type':'application/json'};
 let id:string;try{id=decodeURIComponent(url.pathname.slice(6));if(!id||id.length>2048)throw Error();}catch{return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});}
 try{
 const result=await fetcher(`${config.supabaseUrl}/rest/v1/rpc/resolve_citation_item`,{method:'POST',headers,body:JSON.stringify({p_item_id:id,p_require_citable:false})});
 if(!result.ok)return new Response('Citation unavailable',{status:503,headers:{'cache-control':'no-store'}});
 const item=await result.json() as CitationItem|null;if(!item)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
 const response=await assets.fetch(new Request(new URL('/cite',request.url),request));
 let html=await response.text();
 const license=citationLicense(PUBLIC_ORIGIN,item.citable),json=JSON.stringify(citationJsonLd(item,PUBLIC_ORIGIN)).replace(/</g,'\\u003c');
 html=html.replace('<!--CITATION_HEAD-->',`<link rel="license" href="${escape(license)}"><script type="application/ld+json">${json}</script>`).replace('<!--CITATION_BODY-->',`<main><h1>${escape(item.projectTitle)}</h1><blockquote>${escape(plainCitation(item,PUBLIC_ORIGIN))}</blockquote>${item.citable?'':'<p>View only. The creator has not permitted AI retrieval or reproduction.</p>'}</main>`);
 return new Response(request.method==='HEAD'?null:html,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return new Response('Citation unavailable',{status:503,headers:{'cache-control':'no-store'}});}
}
export function citationLicenseResponse(path:string):Response|null{
 if(!['/licenses/citable-v1','/licenses/view-only-v1'].includes(path))return null;
 const text=path.endsWith('citable-v1')?"Portalink citable permission v1. Others' AI tools may retrieve and reproduce individual pages or images with the creator's name and a link to the original Portalink item. Permission applies only while the creator marks the project citable. No ownership transfer or permission to remove attribution.":'Portalink view-only terms v1. Public viewing is permitted. AI retrieval and reproduction permission is not granted by public visibility. Human attribution and citation do not grant reproduction rights.';
 return new Response(text,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});
}
