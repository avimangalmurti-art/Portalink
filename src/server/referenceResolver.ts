import {textReference,type ReferenceResolution} from '../features/references/model';
const LIMIT=1024*1024;
const tidy=(value:unknown,limit=2000)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,limit):'';
export function isPublicAddress(address:string):boolean{
 const value=address.toLowerCase().replace(/^\[|\]$/g,'');
 if(value.includes(':'))return /^2[0-9a-f]{3}:/.test(value)&&!value.startsWith('2001:db8:')&&!value.startsWith('2001:0:')&&!value.startsWith('2002:');
 const parts=value.split('.').map(Number);if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b]=parts;return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0))&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19||b===51))&&!(a===203&&b===0);
}
export async function boundedText(response:Response,signal:AbortSignal,limit=LIMIT):Promise<string>{
 if(Number(response.headers.get('content-length'))>limit)throw new Error('Response too large');
 const reader=response.body?.getReader();if(!reader)return'';const chunks:Uint8Array[]=[],decoder=new TextDecoder();let size=0;
 try{for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw new Error('Response too large');chunks.push(part.value);}return chunks.map(part=>decoder.decode(part,{stream:true})).join('')+decoder.decode();}
 finally{await reader.cancel().catch(()=>undefined);}
}
export async function validateReferenceUrl(url:URL,fetcher:typeof fetch,signal:AbortSignal):Promise<void>{
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw new Error('Not a public web address');
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(host.includes(':')||/^[\d.]+$/.test(host)){if(!isPublicAddress(host))throw new Error('Private address');return;}
 if(!host.includes('.')||/\.(?:localhost|local|internal|test|invalid|home|lan)$/.test(host))throw new Error('Private hostname');
 const answers=await Promise.all(['A','AAAA'].map(async type=>{const response=await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal,redirect:'error',credentials:'omit'});if(!response.ok)throw new Error('DNS unavailable');const data=JSON.parse(await boundedText(response,signal,65536));if(data.Status!==0)throw new Error('DNS unavailable');return (data.Answer??[]).filter((row:{type:number})=>row.type===1||row.type===28).map((row:{data:string})=>row.data) as string[];}));
 const addresses=answers.flat();if(!addresses.length||addresses.some(address=>!isPublicAddress(address)))throw new Error('Private or unavailable address');
}
function decodeHtml(value:string):string{return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x([\da-f]+)|#(\d+));/gi,(match,hex,number)=>{if(hex||number){const code=parseInt(hex??number,hex?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}return({'&amp;':'&','&quot;':'"','&apos;':"'",'&#39;':"'",'&lt;':'<','&gt;':'>'} as Record<string,string>)[match.toLowerCase()]??match;});}
function tagEnd(html:string,start:number):number{let quote='';for(let i=start;i<html.length;i++){const char=html[i];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')return i;}return -1;}
function metaAttributes(tag:string):Record<string,string>{
 const attributes:Record<string,string>={},pattern=/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/y;let cursor=0;
 while(cursor<tag.length){while(/\s/.test(tag[cursor]??'')&&cursor<tag.length)cursor++;pattern.lastIndex=cursor;const match=pattern.exec(tag);if(match){attributes[match[1].toLowerCase()]=decodeHtml(match[2]??match[3]??match[4]??'');cursor=pattern.lastIndex;}else{while(cursor<tag.length&&!/\s/.test(tag[cursor]))cursor++;}}
 return attributes;
}
export function webMetadata(html:string,url:string):ReferenceResolution['resolved']{
 // Linear tag scanning avoids catastrophic backtracking on malformed upstream
 // HTML. Quotes containing > are handled without executing a DOM or script.
 const meta:Record<string,string>={},lower=html.toLowerCase();let cursor=0;
 while(cursor<html.length){const start=lower.indexOf('<meta',cursor);if(start<0)break;if(!/[\s/>]/.test(html[start+5]??'')){cursor=start+5;continue;}const end=tagEnd(html,start+5);if(end<0)break;const attributes=metaAttributes(html.slice(start+5,end));const key=(attributes.property??attributes.name??'').trim().toLowerCase();if(key&&attributes.content)meta[key]=attributes.content;cursor=end+1;}
 const titleStart=lower.indexOf('<title'),titleOpen=titleStart<0?-1:tagEnd(html,titleStart+6),titleClose=titleOpen<0?-1:lower.indexOf('</title',titleOpen+1);
 const title=tidy(meta['og:title']||decodeHtml(titleClose<0?'':html.slice(titleOpen+1,titleClose)));if(!title||/^(?:human verification|just a moment(?:\.{3}|…)?|access denied|attention required!?|verify you['’]re human|verification required|robot check|captcha)(?:\s*[|—-]|\s*$)/i.test(title))throw new Error('No usable page title');
 return{title,verified:true,url,description:tidy(meta['og:description']||meta.description),authors:meta.author?[tidy(meta.author,250)]:undefined,year:/^\d{4}/.exec(meta['article:published_time']??'')?.[0]};
}
export async function resolveExternalReference(raw:string,dependencies:{fetcher?:typeof fetch;timeoutMs?:number}={}):Promise<ReferenceResolution>{
 const input=raw.trim();if(!input||input.length>16000)throw new Error('Paste a reference of 16,000 characters or fewer.');
 const fetcher=dependencies.fetcher??fetch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),dependencies.timeoutMs??5000),signal=controller.signal;
 // The deadline includes DNS, redirects and reading a streamed body, even when
 // a misbehaving upstream does not settle its fetch promise after abort.
 const deadline=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Resolution timed out')),{once:true}));
 const attempt=async():Promise<ReferenceResolution>=>{
  const doi=/^(?:(?:https?:\/\/(?:dx\.)?doi\.org\/)|doi:\s*)?(10\.\d{4,9}\/\S+)$/i.exec(input)?.[1];
  const isbn=input.replace(/^ISBN(?:-1[03])?:?\s*/i,'').replace(/[-\s]/g,'');
  if(doi){const response=await fetcher(`https://api.crossref.org/works/${encodeURIComponent(doi)}`,{signal,redirect:'error',headers:{accept:'application/json','user-agent':'Portalink/1.0 (reference resolver)'},credentials:'omit'});if(!response.ok)throw new Error();const message=JSON.parse(await boundedText(response,signal)).message;const title=tidy(message?.title?.[0]);if(!title)throw new Error();return{kind:'doi',raw_input:input,resolved:{title,authors:(message.author??[]).slice(0,100).map((author:{given?:string;family?:string;name?:string})=>tidy(author.name||[author.given,author.family].filter(Boolean).join(' '),250)).filter(Boolean),year:String(message.issued?.['date-parts']?.[0]?.[0]??'')||undefined,journal:tidy(message['container-title']?.[0]),doi,verified:true,url:`https://doi.org/${doi}`}};}
  if(/^(?:\d{9}[\dXx]|\d{13})$/.test(isbn)){const response=await fetcher(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,{signal,redirect:'error',credentials:'omit'});if(!response.ok)throw new Error();const book=JSON.parse(await boundedText(response,signal))[`ISBN:${isbn}`];if(!book?.title)throw new Error();return{kind:'isbn',raw_input:input,resolved:{title:tidy(book.title),authors:(book.authors??[]).slice(0,100).map((author:{name:string})=>tidy(author.name,250)),year:/\b\d{4}\b/.exec(book.publish_date??'')?.[0],publisher:tidy(book.publishers?.[0]?.name),isbn,verified:true,url:`https://openlibrary.org/isbn/${isbn}`}};}
  if(/^https?:\/\//i.test(input)){let url=new URL(input);for(let hop=0;hop<4;hop++){await validateReferenceUrl(url,fetcher,signal);const response=await fetcher(url.href,{signal,redirect:'manual',credentials:'omit',headers:{accept:'text/html','user-agent':'Portalink/1.0 (reference resolver)'}});if(response.status>=300&&response.status<400){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw new Error();url=new URL(location,url);continue;}if(!response.ok||!/^text\/html\b/i.test(response.headers.get('content-type')??''))throw new Error();return{kind:'url',raw_input:input,resolved:webMetadata(await boundedText(response,signal),url.href)};}throw new Error('Too many redirects');}
  return textReference(input);
 };
 try{return await Promise.race([attempt(),deadline]);}catch{return textReference(input);}finally{clearTimeout(timer);controller.abort();}
}
export async function handleReferenceResolve(request:Request,authenticate:(request:Request,required:boolean)=>Promise<unknown>,dependencies:Parameters<typeof resolveExternalReference>[1]={}):Promise<Response>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(request.method!=='POST')return json({message:'Method not allowed'},405);
 try{if(!await authenticate(request,true))return json({message:'Sign in to add a reference.'},401);const signal=AbortSignal.timeout(5000);const data=JSON.parse(await boundedText(request as unknown as Response,signal,32768));if(typeof data.input!=='string')return json({message:'Paste a reference.'},400);return json(await resolveExternalReference(data.input,dependencies));}catch(error){return error instanceof Response?error:json({message:'Reference could not be resolved.'},400);}
}
