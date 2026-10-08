import {useEffect,useState} from 'react';
import type {Profile} from '../../types/domain';
import {listCitations,resolveCitationItem,citationProject,citingProjectPath} from './service';
import {citationPath} from './model';
import type {JourneyCitationEvent} from './journeyCitations';
export function useJourneyCitations(profile:Profile,owner:boolean){const [events,setEvents]=useState<JourneyCitationEvent[]>([]);
 useEffect(()=>{
 if(!owner&&profile.publicCitationEvents!==undefined){
  setEvents(profile.publicCitationEvents.map(row=>({id:row.id,date:row.created_at,
   label:row.source==='external'?`Someone cited ${row.label} outside Portalink${row.context?` · ${row.context}`:''}`:row.direction==='incoming'?`${row.other_creator_name} cited ${row.label} in «${row.other_project_title}»`:`Cited ${row.other_project_title}, ${row.label} in «${row.citing_project_title}»`,
   href:row.source==='external'?citationPath(row.item_id):row.direction==='incoming'?`/share/${row.other_profile_id}/c/${row.other_category_id}/${row.other_project_id}`:citationPath(row.item_id)})));
  return;
 }
 let live=true;const load=async()=>{const outgoing=owner||profile.showOutgoingCitations!==false?await listCitations({outgoing:profile.id}):[],incoming=owner||profile.showIncomingCitations!==false?await listCitations({incoming:profile.id}):[];const rows=await Promise.all([...outgoing.map(citation=>({citation,incoming:false})),...incoming.map(citation=>({citation,incoming:true}))].map(async({citation,incoming})=>{const [item,project]=await Promise.all([resolveCitationItem(citation.cited_item_id),citationProject(citation.citing_project_id)]);if(!item)return null;if(citation.source==='external')return {id:citation.id,date:citation.created_at,label:`Someone cited ${item.kind} ${item.number} of «${item.projectTitle}» outside Portalink${citation.context?` · ${citation.context}`:''}`,href:citationPath(item.id),thumbnail:item.sourceUrl??item.coverSourceUrl};if(!project)return null;return {id:citation.id,date:citation.created_at,label:incoming?`${project.creator} cited ${item.kind==='page'?'page':'image'} ${item.number} of «${item.projectTitle}»`:`Cited ${item.projectTitle}, ${item.kind} ${item.number} in «${project.title}»`,href:incoming?citingProjectPath(project):citationPath(item.id),thumbnail:item.sourceUrl};}));if(live)setEvents(rows.filter((row):row is NonNullable<typeof row>=>row!==null));};void load().catch(()=>{if(live)setEvents([]);});return()=>{live=false;};},[profile.publicCitationEvents,profile.id,profile.showOutgoingCitations,profile.showIncomingCitations,owner]);return events;
}
