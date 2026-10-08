import React,{useEffect,useState} from 'react';
import {requireSupabase} from '../../services/supabase/client';
export function CitableProjectBadge({projectId}:{projectId:string}){
 const [citable,setCitable]=useState(false);
 useEffect(()=>{let live=true;setCitable(false);void Promise.resolve(requireSupabase().rpc('is_project_citable',{p_project_id:projectId})).then(({data})=>{if(live)setCitable(data===true);}).catch(()=>{if(live)setCitable(false);});return()=>{live=false;};},[projectId]);
 return citable?<span className="citation-badge">Citable</span>:null;
}
