import React, { useState, type RefObject } from 'react';
import { BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon, ListIcon, ListOrderedIcon, IndentIncreaseIcon, IndentDecreaseIcon, QuoteIcon, XIcon, TypeIcon } from 'lucide-react';
import { formatSelection, type TextFormat } from './textFormatting';
import { FormattedText } from './FormattedText';
export function TextFormattingToolbar({inputRef,value,onChange,disabled,maxLength}:{inputRef:RefObject<HTMLTextAreaElement>;value:string;onChange:(value:string)=>void;disabled?:boolean;maxLength?:number}){
 const [open,setOpen]=useState(false),[notice,setNotice]=useState('');
 const apply=(format:TextFormat,color?:string)=>{
  const input=inputRef.current;if(!input||disabled)return;
  const next=formatSelection(value,input.selectionStart,input.selectionEnd,format,color);
  if(maxLength&&next.value.length>maxLength){setNotice('This formatting exceeds the text limit.');return;}
  setNotice('');onChange(next.value);requestAnimationFrame(()=>{input.focus();input.setSelectionRange(next.start,next.end);});
 };
 const icons=[['bold','Bold',BoldIcon],['italic','Italic',ItalicIcon],['underline','Underline',UnderlineIcon],['strike','Strikethrough',StrikethroughIcon],['bullet','Bullet list',ListIcon],['number','Numbered list',ListOrderedIcon],['outdent','Decrease indent',IndentDecreaseIcon],['indent','Increase indent',IndentIncreaseIcon],['quote','Quote',QuoteIcon]] as const;
 return <div className="text-format-tools">
  <button type="button" className="text-format-open" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(!open)}><TypeIcon size={18}/>Format text</button>
  {open&&<section aria-label="Text formatting" className="text-format-panel"><header><strong>Format</strong><button type="button" aria-label="Close formatting" onClick={()=>setOpen(false)}><XIcon size={20}/></button></header>
   <div className="text-format-headings">{(['title','heading','subheading','body'] as const).map(f=><button type="button" key={f} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply(f)}>{f[0].toUpperCase()+f.slice(1)}</button>)}</div>
   <div className="text-format-buttons">{icons.map(([f,label,Icon])=><button type="button" key={f} aria-label={label} title={label} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply(f)}><Icon size={20}/></button>)}
   {['#ff315f','#ff9500','#34c759','#0a84ff','#af52de'].map(color=><button type="button" key={color} aria-label={`Text color ${color}`} disabled={disabled} onPointerDown={e=>e.preventDefault()} onClick={()=>apply('color',color)}><span style={{background:color}} className="text-format-color"/></button>)}</div>
   <p className="text-format-hint">Select text to format. Preview below.</p><div className="text-format-preview" aria-label="Formatted preview"><FormattedText text={value}/></div>
  </section>}{notice&&<p role="status">{notice}</p>}
 </div>;
}
