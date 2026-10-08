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
export type FormattedInline = { kind: 'text' | 'strong' | 'em' | 'strongEm' | 'u' | 's' | 'color'; text: string; color?: string; children?: FormattedInline[] };
/** Shared parsing for visible text and plain citation/metadata text. Never HTML. */
export function formattedInline(text: string): FormattedInline[] {
  const pattern = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\+\+[^+]+\+\+|~~[^~]+~~|\*[^*]+\*|\{#[a-fA-F0-9]{6}\|[^}]+\})/g;
  return text.split(pattern).filter(Boolean).map(part => {
    const color = /^\{(#[a-fA-F0-9]{6})\|([\s\S]*)\}$/.exec(part);
    const wrapper = color ? { kind: 'color' as const, text: color[2], color: color[1] }
      : /^\*\*\*[\s\S]+\*\*\*$/.test(part) ? { kind: 'strongEm' as const, text: part.slice(3,-3) }
      : /^\*\*[\s\S]+\*\*$/.test(part) ? { kind: 'strong' as const, text: part.slice(2,-2) }
      : /^\+\+[\s\S]+\+\+$/.test(part) ? { kind: 'u' as const, text: part.slice(2,-2) }
      : /^~~[\s\S]+~~$/.test(part) ? { kind: 's' as const, text: part.slice(2,-2) }
      : /^\*[^*]+\*$/.test(part) ? { kind: 'em' as const, text: part.slice(1,-1) } : null;
    return wrapper ? { ...wrapper, children: formattedInline(wrapper.text) } : { kind: 'text', text: part };
  });
}
export function plainFormattedText(value: string): string {
  const flatten = (nodes: FormattedInline[]): string => nodes.map(node => node.children ? flatten(node.children) : node.text).join('');
  return flatten(formattedInline(value)).replace(/^ *(?:#{1,3} |> |- |\d+\. )/gm, '');
}
