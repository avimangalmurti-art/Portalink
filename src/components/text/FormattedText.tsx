import React from 'react';
import './text-formatting.css';
import { formattedInline, type FormattedInline } from './textFormatting';
function inline(text: string): React.ReactNode[] {
  const render = (nodes: FormattedInline[]): React.ReactNode[] => nodes.map((node,i) => {
    const children = node.children ? render(node.children) : node.text;
    if (node.kind === 'strongEm') return <strong key={i}><em>{children}</em></strong>;
    if (node.kind === 'color') return <span key={i} style={{ color: node.color }}>{children}</span>;
    if (node.kind === 'text') return children;
    const Tag = node.kind;
    return <Tag key={i}>{children}</Tag>;
  });
  return render(formattedInline(text));
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
