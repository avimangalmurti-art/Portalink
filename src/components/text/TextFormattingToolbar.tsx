import React, { useState, type RefObject } from 'react';
import { BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, ListIcon, ListOrderedIcon, IndentIncreaseIcon, IndentDecreaseIcon, QuoteIcon, XIcon, TypeIcon } from 'lucide-react';
import { formatSelection, type TextFormat } from './textFormatting';
import { usePresentation } from '../../presentation/usePresentation';
import { FormattedText } from './FormattedText';
export function TextFormattingToolbar({inputRef,value,onChange,disabled,maxLength,variant='panel'}:{inputRef:RefObject<HTMLTextAreaElement>;value:string;onChange:(value:string)=>void;disabled?:boolean;maxLength?:number;variant?:'panel'|'dropdown'}){
 const inline = usePresentation() === 'mobile' && variant === 'panel';
 const [open,setOpen]=useState(false),[notice,setNotice]=useState('');
 const apply=(format:TextFormat,color?:string)=>{
  const input=inputRef.current;if(!input||disabled)return;
  const next=formatSelection(value,input.selectionStart,input.selectionEnd,format,color);
  if(maxLength&&next.value.length>maxLength){setNotice('This formatting exceeds the text limit.');return;}
  setNotice('');onChange(next.value);requestAnimationFrame(()=>{input.focus();input.setSelectionRange(next.start,next.end);});
 };
 const icons=[['bold','Bold',BoldIcon],['italic','Italic',ItalicIcon],['underline','Underline',UnderlineIcon],['strike','Strikethrough',StrikethroughIcon],['bullet','Bullet list',ListIcon],['number','Numbered list',ListOrderedIcon],['outdent','Decrease indent',IndentDecreaseIcon],['indent','Increase indent',IndentIncreaseIcon],['quote','Quote',QuoteIcon]] as const;
 if(variant==='dropdown') return <div className="text-format-tools text-format-tools--dropdown">
  <select aria-label="Format text" value="" disabled={disabled} onChange={event=>{
   const choice=event.target.value;
   if(choice.startsWith('#')) apply('color',choice); else apply(choice as TextFormat);
  }}>
   <option value="" disabled>Format text</option>
   <optgroup label="Text style">{(['title','heading','subheading','body'] as const).map(f=><option key={f} value={f}>{f[0].toUpperCase()+f.slice(1)}</option>)}{icons.map(([f,label])=><option key={f} value={f}>{label}</option>)}</optgroup>
   <optgroup label="Text colour">{[['#ff315f','Pink'],['#ff9500','Orange'],['#34c759','Green'],['#0a84ff','Blue'],['#af52de','Purple']].map(([color,label])=><option key={color} value={color}>{label}</option>)}</optgroup>
  </select>{notice&&<p role="status">{notice}</p>}
 </div>;
 return <div className={`text-format-tools${inline ? ' text-format-tools--inline' : ''}`}>
  {!inline && <button type="button" className="text-format-open" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}><TypeIcon size={18}/>Format text</button>}
  {(inline || open)&&<section aria-label="Text formatting" className="text-format-panel">{!inline && <header><strong>Format</strong><button type="button" aria-label="Close formatting" onClick={()=>setOpen(false)}><XIcon size={20}/></button></header>}
   <div className="text-format-headings">{(['title','heading','subheading','body'] as const).map(f=><button type="button" key={f} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div>
   <div className="text-format-buttons">{icons.map(([f,label,Icon])=><button type="button" key={f} aria-label={label} title={label} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply(f)}><Icon size={20}/></button>)}
   {['#ff315f','#ff9500','#34c759','#0a84ff','#af52de'].map(color=><button type="button" key={color} aria-label={`Text color ${color}`} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply('color',color)}><span style={{background:color}} className="text-format-color"/></button>)}</div>
   {!inline && <><p className="text-format-hint">Select text to format. Preview below.</p><div className="text-format-preview" aria-label="Formatted preview"><FormattedText text={value}/></div></>}
  </section>}{notice&&<p role="status">{notice}</p>}
 </div>;
}
