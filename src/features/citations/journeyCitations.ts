import type {Project} from '../../types/domain';
import {journeyProjects} from '../journey/journey';
export type JourneyCitationEvent={id:string;date:string;label:string;href:string;thumbnail?:string};
export type JourneyTimelineEntry={kind:'project';project:Project;date:string}|{kind:'citation';event:JourneyCitationEvent;date:string};
export function journeyTimeline(projects:Project[],events:JourneyCitationEvent[],owner:boolean){
 const entries:JourneyTimelineEntry[]=[...journeyProjects(projects,owner).map(project=>({kind:'project' as const,project,date:project.madeOn??project.publishedAt??''})),...events.map(event=>({kind:'citation' as const,event,date:event.date}))];
 entries.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||(a.kind==='project'?a.project.id:a.event.id).localeCompare(b.kind==='project'?b.project.id:b.event.id));
 const years=new Map<number|null,JourneyTimelineEntry[]>();for(const entry of entries){const time=Date.parse(entry.date),year=Number.isFinite(time)?new Date(time).getUTCFullYear():null;years.set(year,[...(years.get(year)??[]),entry]);}
 return [...years].sort(([a],[b])=>(b??-1)-(a??-1)).map(([year,entries])=>({year,entries,gap:false}));
}
