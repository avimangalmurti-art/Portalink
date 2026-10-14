import {coverImage,signImage} from './sharedPreview';
import {plainFormattedText} from '../components/text/textFormatting';
import {PUBLIC_ORIGIN} from '../features/citations/publicOrigin';
import {readCoverThumbnail} from '../services/supabase/coverThumbnailReads';
import {boundedText} from './referenceResolver';
type Config={supabaseUrl:string;publishableKey:string};
type Row=Record<string,unknown>;
export type PortfolioDocument={name:string;handle:string;generated_at:string;projects:Array<{id:string;title:string;portal:string;made_on:string;summary:string;citation_url:string;cover_url:string|null}>};
const clean=(value:unknown,max=500)=>typeof value==='string'?plainFormattedText(value).replace(/\s+/g,' ').trim().slice(0,max):'';
async function rows(table:string,query:URLSearchParams,config:Config,signal:AbortSignal,fetcher:typeof fetch):Promise<Row[]>{
 const request=(parameters:URLSearchParams)=>fetcher(`${config.supabaseUrl}/rest/v1/${table}?${parameters}`,{headers:{apikey:config.publishableKey,accept:'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal});let response=await request(query);
 if(!response.ok&&table==='profiles'&&query.get('select')?.includes('allow_pdf_download')){const error=await response.clone().json().catch(()=>null);if(['42703','PGRST204'].includes(error?.code)&&/allow_pdf_download/.test(error?.message??'')){const legacy=new URLSearchParams(query);legacy.set('select',query.get('select')!.replace(',allow_pdf_download',''));response=await request(legacy);}}
 if(!response.ok)throw new Error('Public portfolio unavailable');const data=JSON.parse(await boundedText(response,signal,8*1024*1024));if(!Array.isArray(data))throw new Error('Public portfolio unavailable');return data;
}
export async function publicPortfolio(profileId:string,config:Config,fetcher:typeof fetch=fetch,now=new Date()):Promise<PortfolioDocument|null>{
 const signal=AbortSignal.timeout(30000),profileRows=await rows('profiles',new URLSearchParams({select:'id,name,handle,is_private,allow_pdf_download',id:`eq.${profileId}`,is_private:'eq.false'}),config,signal,fetcher);
 const profile=profileRows[0];if(!profile||profile.id!==profileId||profile.is_private!==false||profile.allow_pdf_download===false)return null;
 const projects:Row[]=[];for(let offset=0;;offset+=500){const page=await rows('projects',new URLSearchParams({select:'id,profile_id,category_id,title,summary,made_on,is_hidden,cover_thumbnail,category:portfolio_categories!inner(id,label,is_hidden)',profile_id:`eq.${profileId}`,is_hidden:'eq.false','category.is_hidden':'eq.false',order:'made_on.desc,id',limit:'500',offset:String(offset)}),config,signal,fetcher);projects.push(...page);if(page.length<500)break;}
 const output:PortfolioDocument={name:clean(profile.name,200),handle:clean(profile.handle,100),generated_at:now.toISOString(),projects:[]};
 for(const project of projects){const category=project.category as Row|undefined;if(project.profile_id!==profileId||project.is_hidden!==false||!category||category.is_hidden!==false||category.id!==project.category_id)continue;
  const id=String(project.id),thumbnail=readCoverThumbnail(project.cover_thumbnail,profileId,id),variant=thumbnail?.variants.find(row=>row.size===800);let cover:string|null=null;
  if(thumbnail&&variant){const path=variant.path.split('/').map(encodeURIComponent).join('/');if(thumbnail.bucket==='project-covers')cover=`${config.supabaseUrl}/storage/v1/object/public/project-covers/${path}`;
   else{const expected=`/storage/v1/object/sign/project-media/${path}`,response=await fetcher(`${config.supabaseUrl}${expected}`,{method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({expiresIn:120}),credentials:'omit',redirect:'error',cache:'no-store',signal});if(response.ok){const data=await response.json() as {signedURL?:string};if(data.signedURL){const signed=new URL(data.signedURL.startsWith('/object/')?'/storage/v1'+data.signedURL:data.signedURL,config.supabaseUrl);if(signed.origin===new URL(config.supabaseUrl).origin&&signed.pathname===expected&&signed.searchParams.get('token'))cover=signed.href;}}}
  }
  const first=await rows('project_attachments',new URLSearchParams({select:'id,project_id,kind,mime_type,storage_path,metadata,is_cover,position',project_id:`eq.${id}`,kind:'in.(image,document)',order:'is_cover.desc,position.asc,id',limit:'1'}),config,signal,fetcher);
  if(!cover){const fallback=coverImage({...project,attachments:first},profileId);if(fallback)cover=fallback.public?config.supabaseUrl+'/storage/v1/object/public/project-covers/'+fallback.path:await signImage(fallback.path,config.supabaseUrl,config,signal,fetcher,120);}
  let citationUrl=`${PUBLIC_ORIGIN}/share/${profileId}/c/${project.category_id}/${id}`;
  if(first[0]){const image=first[0].kind==='image',response=await fetcher(`${config.supabaseUrl}/rest/v1/rpc/${image?'resolve_public_image_id':'resolve_public_page_id'}`,{method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify(image?{p_attachment_id:first[0].id}:{p_attachment_id:first[0].id,p_page_number:1}),credentials:'omit',redirect:'error',signal});if(response.ok){const item=await response.json();if(typeof item==='string'&&item)citationUrl=`${PUBLIC_ORIGIN}/cite/${encodeURIComponent(item)}`;}}
  output.projects.push({id,title:clean(project.title),portal:clean(category.label,200),made_on:clean(project.made_on,10),summary:clean(String(project.summary??'').split(/\r?\n/).find(line=>line.trim())??''),citation_url:citationUrl,cover_url:cover});
 }
 return output;
}
export async function handlePortfolioExport(request:Request,profileId:string,environment:{PORTFOLIO_PDF_WORKER_URL?:string;PORTFOLIO_PDF_WORKER_SECRET?:string},config:Config,dependencies:{fetcher?:typeof fetch;now?:Date}={}):Promise<Response>{
 const fail=(message:string,status:number)=>new Response(message,{status,headers:{'cache-control':'no-store','content-type':'text/plain;charset=utf-8'}});
 if(!['GET','HEAD'].includes(request.method))return fail('Method not allowed',405);
 if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(profileId))return fail('Not found',404);
 if(!environment.PORTFOLIO_PDF_WORKER_URL||!environment.PORTFOLIO_PDF_WORKER_SECRET)return fail('Portfolio PDF is not available yet.',503);
 try{const endpoint=new URL(environment.PORTFOLIO_PDF_WORKER_URL);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error();
  const fetcher=dependencies.fetcher??fetch,document=await publicPortfolio(profileId,config,fetcher,dependencies.now);if(!document)return fail('Not found',404);
  const response=await fetcher(endpoint.href,{method:'POST',headers:{authorization:`Bearer ${environment.PORTFOLIO_PDF_WORKER_SECRET}`,'content-type':'application/json'},body:JSON.stringify(document),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok||!/^application\/pdf\b/.test(response.headers.get('content-type')??''))return fail('Portfolio PDF is not available yet.',503);
  return new Response(request.method==='HEAD'?null:response.body,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="portalink-portfolio.pdf"','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return fail('Portfolio PDF is not available yet.',503);}
}
