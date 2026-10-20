import '../index.css';
import React,{useEffect,useState} from 'react';
import {AppPresentationProvider} from '../presentation/AppPresentation';
import CitationPagePreview from '../features/citations/CitationPagePreview';
import {resolveCitationItem} from '../features/citations/service';
import type {CitationItem} from '../features/citations/model';
export default function CitationDocument({item}:{item:CitationItem}) {
 const [document,setDocument]=useState(item);
 useEffect(()=>{let live=true;void resolveCitationItem(item.id,true).then(value=>{if(live&&value)setDocument(value);}).catch(()=>undefined);return()=>{live=false;};},[item]);
 return <AppPresentationProvider><CitationPagePreview item={document}/></AppPresentationProvider>;
}
