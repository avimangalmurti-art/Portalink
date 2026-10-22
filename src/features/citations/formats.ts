import { bibCitation, citationUrl, plainCitation, type CitationItem } from './model';
import { plainFormattedText } from '../../components/text/textFormatting';
export type CitationFormat = 'mla' | 'apa' | 'plain' | 'bibtex';
export const citationFormatLabels: Record<CitationFormat,string> = {mla:'MLA',apa:'APA',plain:'Plain text',bibtex:'BibTeX'};
/** Creator display names stay intact: never guess a surname or missing metadata. */
export function formatCitation(item:CitationItem, origin:string, format:CitationFormat):string {
 if(format==='plain')return plainCitation(item,origin);
 if(format==='bibtex')return bibCitation(item,origin);
 const author=item.creator.trim(),title=plainFormattedText(item.projectTitle).trim();
 const locator=`${item.kind==='page'?'Page':'Image'} ${item.number}`;
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(item.madeOn)&&!Number.isNaN(Date.parse(item.madeOn+'T00:00:00Z'));
 const parsed=valid?new Date(item.madeOn+'T00:00:00Z'):null;
 const date=parsed?.toISOString().slice(0,10)===item.madeOn?parsed:null;
 const url=citationUrl(item,origin);
 if(format==='mla')return `${author?author+'. ':''}“${title}.” ${locator}. Portalink${date?', '+`${date.getUTCDate()} ${date.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'})} ${date.getUTCFullYear()}`:''}, ${url}.`;
 const when=date?`${date.getUTCFullYear()}, ${date.toLocaleDateString('en-US',{month:'long',timeZone:'UTC'})} ${date.getUTCDate()}`:'n.d.';
 return `${author?author+'. ':''}(${when}). ${title} [${locator}]. Portalink. ${url}`;
}
