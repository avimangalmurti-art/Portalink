import React from 'react';
import {sourceModule} from './source-module.mjs';
const journey=sourceModule('src/features/journey/journey.ts');
const events=[{id:'citation',date:'2026-01-02',label:'A citation event',href:'/cite/public-item'}];
const timeline=sourceModule('src/features/citations/journeyCitations.ts',{'../journey/journey':journey});
class StableDate extends Date{toLocaleDateString(){return this.toISOString().slice(0,10);}}
export const imports={react:React,'../../components/text/FormattedText':{FormattedText:({text,...props})=>React.createElement('span',props,text)},'../citations/useJourneyCitations':{useJourneyCitations:()=>events},'../citations/journeyCitations':timeline,'lucide-react':{MoreHorizontalIcon:()=>null},'../../components/ui/InterfaceIcon':{InterfaceIcon:()=>null},'../../components/media/MobileProjectPopup':{MobileProjectPopup:()=>null},'../../presentation/usePresentation':{usePresentation:()=> 'mobile'},'../../components/media/ProjectCover':{ProjectCover:({alt})=>React.createElement('img',{alt})},'./journey':journey,'./journey.css':{}};
export const publicJourney=sourceModule('src/features/journey/JourneyView.tsx',imports,{Date:StableDate});
export const recordProps={profile:{id:'public-profile',name:'Example Creator',categories:[{id:'design',label:'Design'}],projects:[{id:'old',title:'Earlier work',summary:'An earlier study.',madeOn:'2024-02-03',categoryId:'design',isPubliclyVisible:true},{id:'new',title:'Later work',summary:'A later study.',madeOn:'2025-07-08',categoryId:'design',isPubliclyVisible:true},{id:'private',title:'Private work',summary:'Hidden.',madeOn:'2026-01-01',isPubliclyVisible:false}]},owner:false,onOpen(){}};
