import React,{useCallback,useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { currentWeek } from './readSignal';
import { Button } from '../../components/ui/Button';
import './reads.css';
/** One local preference dismisses the card; readership itself always comes from D1. */
export function WeeklyReadNote(){
  const {reads}=useServices(),auth=useAuth(),navigate=useNavigate();const week=currentWeek(new Date()),key=`portalink.reads.dismissed:${auth.user?.id??''}:${week}`;
  const [dismissedKey,setDismissedKey]=useState('');
  let storedDismissal=false;try{storedDismissal=localStorage.getItem(key)==='yes';}catch{/* Optional device preference. */}
  const dismissed=dismissedKey===key||storedDismissal;
  const load=useCallback(()=>reads?reads.list():Promise.resolve([]),[reads]);const state=useAccountQuery(load);
  const rows=state.data?.filter(row=>row.weekly.opened>0)??[],opened=rows.reduce((sum,row)=>sum+row.weekly.opened,0),finished=rows.reduce((sum,row)=>sum+row.weekly.finished,0);
  if(!auth.user||dismissed||!opened)return null;
  return <aside className="reads-weekly" aria-label="This week"><small>This week</small><h2>{opened} project opens. {finished} reads reached the end.</h2><p>Your work is being read. These are anonymous tab counts, not identified people.</p><div><Button onClick={()=>navigate(rows.length===1?`/insights?project=${rows[0].projectId}`:'/insights')}>See reads</Button><Button variant="secondary" onClick={()=>{try{localStorage.setItem(key,'yes');}catch{/* Optional local preference. */}setDismissedKey(key);}}>Dismiss</Button></div></aside>;
}
