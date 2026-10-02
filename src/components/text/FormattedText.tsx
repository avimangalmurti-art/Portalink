import React from 'react';
import './text-formatting.css';
function inline(text:string): React.ReactNode[] {
  const pattern=/(\*\*.+?\*\*|\+\+[^+]+\+\+|~~[^~]+~~|\*[^*]+\*|\{#[a-fA-F0-9]{6}\|[^}]+\})/g;
  return text.split(pattern).filter(Boolean).map((part,i)=>{
    if(part.startsWith('**'))return <strong key={i}>{inline(part.slice(2,-2))}</strong>;
    if(part.startsWith('++'))return <u key={i}>{inline(part.slice(2,-2))}</u>;
    if(part.startsWith('~~'))return <s key={i}>{inline(part.slice(2,-2))}</s>;
    if(part.startsWith('*'))return <em key={i}>{inline(part.slice(1,-1))}</em>;
    if(/^\{#[a-fA-F0-9]{6}\|/.test(part))return <span key={i} style={{color:part.slice(1,8)}}>{inline(part.slice(9,-1))}</span>;
    return part;
  });
}
export function FormattedText({text,className='',style}:{text:string;className?:string;style?:React.CSSProperties}){
  const lines=text.split('\n');const result:React.ReactNode[]=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i],indent=Math.min(6,Math.floor((line.match(/^ */)?.[0].length??0)/2));
    const heading=line.trimStart().match(/^(#{1,3}) (.*)$/);
    if(heading){const Tag=heading[1].length===1?'h2':heading[1].length===2?'h3':'h4';result.push(<Tag key={i}>{inline(heading[2])}</Tag>);continue;}
    const list=line.trimStart().match(/^(- |\d+\. )(.*)$/);
    if(list){const ordered=/^\d/.test(list[1]),items:React.ReactNode[]=[];const key=i;const number=Number.parseInt(list[1])||1;
      while(i<lines.length){const next=lines[i].trimStart().match(ordered?/^\d+\. (.*)$/:/^- (.*)$/);if(!next)break;items.push(<li key={i}>{inline(next[1])}</li>);i++;}i--;
      result.push(ordered?<ol key={key} start={number} style={{marginInlineStart:indent*16}}>{items}</ol>:<ul key={key} style={{marginInlineStart:indent*16}}>{items}</ul>);continue;}
    if(line.trimStart().startsWith('> '))result.push(<blockquote key={i}>{inline(line.trimStart().slice(2))}</blockquote>);
    else result.push(<p key={i} style={{paddingInlineStart:indent*16}}>{line?inline(line):<br/>}</p>);
  }
  return <div className={`formatted-text ${className}`} style={style}>{result}</div>;
}
