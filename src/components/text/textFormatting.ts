export type TextFormat = 'title' | 'heading' | 'subheading' | 'body' | 'bold' | 'italic' | 'underline' | 'strike' | 'bullet' | 'number' | 'quote' | 'indent' | 'outdent' | 'color';
export function formatSelection(value: string, start: number, end: number, format: TextFormat, color = '#ff315f') {
  const selected = value.slice(start, end);
  const pairs: Partial<Record<TextFormat, [string, string]>> = { bold: ['**','**'], italic: ['*','*'], underline: ['++','++'], strike: ['~~','~~'], color: [`{${color}|`,'}'] };
  const pair=pairs[format];
  if(pair) {
    const text=selected || 'Text';
    return {value:value.slice(0,start)+pair[0]+text+pair[1]+value.slice(end),start:start+pair[0].length,end:start+pair[0].length+text.length};
  }
  const from=(start === 0 ? 0 : value.lastIndexOf('\n',start-1)+1);
  const newline=value.indexOf('\n',end),to=newline<0?value.length:newline;
  const lines=value.slice(from,to).split('\n').map((line,i)=>{
    if(format==='indent')return '  '+line;
    if(format==='outdent')return line.replace(/^ {1,2}/,'');
    const prefixes={title:'# ',heading:'## ',subheading:'### ',body:'',bullet:'- ',number:`${i+1}. `,quote:'> '};
    const prefix=prefixes[format as keyof typeof prefixes]??'';
    return prefix+line.replace(/^(?:#{1,3} |[-*] |\d+\. |> )/,'');
  }).join('\n');
  return {value:value.slice(0,from)+lines+value.slice(to),start:from,end:from+lines.length};
}
export function plainFormattedText(value: string) {
  return value.replace(/\{#[a-fA-F0-9]{6}\|([^}]+)\}/g,'$1').replace(/\*\*([^*]+)\*\*|\+\+([^+]+)\+\+|~~([^~]+)~~|\*([^*]+)\*/g,(_all,...groups)=>groups.slice(0,4).find(Boolean)??'').replace(/^ {0,}\s*(?:#{1,3} |> )/gm,'');
}
