import React,{Suspense,lazy,useState} from 'react';
import {useAuth} from '../../contexts/AuthContext';
import {JourneyView} from './JourneyView';
import './journey-insights.css';
const Insights=lazy(()=>import('./JourneyInsightsView').then(module=>({default:module.JourneyInsightsView})));
type Props=React.ComponentProps<typeof JourneyView>;
function OwnerJourney(props:Props){
 const [view,setView]=useState<'record'|'insights'>('record');
 return <div className="owner-journey"><header className="owner-journey-header"><nav aria-label="Journey view"><button type="button" aria-pressed={view==='record'} onClick={()=>setView('record')}>Record</button><span aria-hidden="true">·</span><button type="button" aria-pressed={view==='insights'} onClick={()=>setView('insights')}>Insights</button></nav></header>{view==='record'?<JourneyView {...props}/>:<Suspense fallback={<p role="status">Opening Insights…</p>}><Insights {...props}/></Suspense>}</div>;
}
export function OwnerJourneyView(props:Props){const auth=useAuth();return props.owner&&auth.isAuthenticated&&auth.viewerProfileId===props.profile.id?<OwnerJourney key={`${auth.user?.id}:${props.profile.id}`} {...props}/>:<JourneyView {...props} owner={false}/>;}
