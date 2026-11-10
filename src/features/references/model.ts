import {bibCitation,plainCitation,type CitationItem} from '../citations/model';
export type ReferenceKind='doi'|'url'|'isbn'|'text';
export type ReferenceMetadata={title:string;authors?:string[];year?:string;journal?:string;publisher?:string;doi?:string;isbn?:string;url?:string;description?:string;verified:boolean;note?:string};
export type ReferenceResolution={kind:ReferenceKind;raw_input:string;resolved:ReferenceMetadata};
export type ExternalReference=ReferenceResolution&{id:string;project_id:string;owner_profile_id:string;created_at:string};
export type ReferenceProject={id:string;title:string;updated_at:string};
export const referenceSource=(kind:ReferenceKind)=>({doi:'DOI',url:'Web',isbn:'Book',text:'Text'}[kind]);
export function referenceHref(row:ExternalReference):string|undefined{try{const url=new URL(row.resolved.url??(row.resolved.doi?`https://doi.org/${row.resolved.doi}`:row.resolved.isbn?`https://openlibrary.org/isbn/${row.resolved.isbn}`:''));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}}
export function textReference(raw:string):ReferenceResolution{return{kind:'text',raw_input:raw,resolved:{title:raw,verified:false,note:'Couldn’t verify'}};}
export function readExternalReference(row:ExternalReference):ExternalReference{
 const value=row.resolved&&typeof row.resolved==='object'?row.resolved:{} as ReferenceMetadata;
 const text=(input:unknown,max=2000)=>typeof input==='string'?input.slice(0,max):undefined;
 return{...row,resolved:{title:text(value.title)??row.raw_input,authors:Array.isArray(value.authors)?value.authors.filter((author):author is string=>typeof author==='string').slice(0,100).map(author=>author.slice(0,250)):undefined,year:text(value.year,20),journal:text(value.journal),publisher:text(value.publisher),doi:text(value.doi),isbn:text(value.isbn,20),url:text(value.url,8192),description:text(value.description),verified:value.verified===true,note:text(value.note)}};
}
const escapeBib=(value:string)=>value.replace(/\\/g,'\\textbackslash{}').replace(/[{}%&#_$]/g,char=>`\\${char}`).replace(/[\r\n]/g,' ');
export function externalPlain(row:ExternalReference):string{
 const data=row.resolved;if(row.kind==='text')return `${row.raw_input}${data.verified?'':' · Couldn’t verify'}`;
 return `${data.authors?.join(', ')||'Unknown author'} (${data.year||'n.d.'}). ${data.title}.${data.journal?` ${data.journal}.`:''}${data.publisher?` ${data.publisher}.`:''}${data.doi?` https://doi.org/${data.doi}`:data.url?` ${data.url}`:''}${data.isbn?` ISBN ${data.isbn}.`:''}`;
}
export function externalBib(row:ExternalReference):string{
 const data=row.resolved,fields:Record<string,string|undefined>={author:data.authors?.join(' and '),title:data.title,year:data.year,journal:data.journal,publisher:data.publisher,doi:data.doi,isbn:data.isbn,url:data.url,note:row.kind==='text'?`${row.raw_input} · Couldn’t verify`:undefined};
 return `@${row.kind==='doi'?'article':row.kind==='isbn'?'book':'misc'}{external_${row.id.replace(/[^a-zA-Z0-9]/g,'_')},\n${Object.entries(fields).filter(([,value])=>value).map(([key,value])=>`  ${key} = {${escapeBib(value!)}},`).join('\n')}\n}`;
}
export type BibliographyEntry={id:string;portalink?:CitationItem|null;external?:ExternalReference};
export function bibliography(entries:BibliographyEntry[],origin:string){
 const seen=new Set<string>(),unique=entries.filter(entry=>{const key=entry.external?'external:'+entry.external.id:'portalink:'+(entry.portalink?.id??entry.id);if(seen.has(key))return false;seen.add(key);return true;});
 return{plain:unique.map(entry=>entry.external?externalPlain(entry.external):entry.portalink?plainCitation(entry.portalink,origin):`Reference unavailable. Portalink. ${origin}/cite/${encodeURIComponent(entry.id)}`).join('\n\n'),bibtex:unique.map(entry=>entry.external?externalBib(entry.external):entry.portalink?bibCitation(entry.portalink,origin):`@misc{portalink_${entry.id.replace(/[^a-zA-Z0-9]/g,'_')},\n  title = {Reference unavailable},\n  url = {${escapeBib(origin+'/cite/'+encodeURIComponent(entry.id))}}\n}`).join('\n\n')};
}
export function weekStart(now=new Date()):string{const date=new Date(now);date.setHours(0,0,0,0);date.setDate(date.getDate()-((date.getDay()+6)%7));return date.toISOString();}
