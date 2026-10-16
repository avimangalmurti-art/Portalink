import React,{useCallback,useEffect,useRef,useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { currentWeek } from './readSignal';
import { Button } from '../../components/ui/Button';
import './reads.css';
const dismissedSessions = new WeakMap<object, Set<string>>();
/** Dismiss only for this login; readership itself always comes from D1. */
export function WeeklyReadNote({startupPending=false,startupAttempt=0,onStartupSettled}:{startupPending?:boolean;startupAttempt?:number;onStartupSettled?:(settled:boolean)=>void}={}){
  const {reads}=useServices(),auth=useAuth(),navigate=useNavigate();const week=currentWeek(new Date()),key=`portalink.reads.dismissed:${auth.user?.id??''}:${week}`;
  const fallbackSession=useRef({});
  const session=auth.loginSession??fallbackSession.current;
  const [,setDismissedKey]=useState<object|null>(null);
  const dismissed=dismissedSessions.get(session)?.has(key)??false;
  const load=useCallback(()=>reads?reads.list():Promise.resolve([]),[reads]);const state=useAccountQuery(load);
  const retry=useRef(state.retry);retry.current=state.retry;
  const previousAttempt=useRef(startupAttempt);
  useEffect(()=>{if(startupPending&&previousAttempt.current!==startupAttempt)retry.current();previousAttempt.current=startupAttempt;},[startupPending,startupAttempt]);
  const settled=!auth.user||dismissed||!state.loading;
  useEffect(()=>{onStartupSettled?.(settled);},[onStartupSettled,settled,startupAttempt]);
  const rows=state.data?.filter(row=>row.weekly.opened>0)??[],opened=rows.reduce((sum,row)=>sum+row.weekly.opened,0),finished=rows.reduce((sum,row)=>sum+row.weekly.finished,0);
  if(!auth.user||dismissed||state.loading||state.error||!state.data)return null;
  return <aside className="reads-weekly" aria-label="This week"><small>This week</small><h2>{opened} project opens. {finished} reads reached the end.</h2><p>{opened>0?'Your work is being read. These are anonymous tab counts, not identified people.':'Share your work and check back to see how it’s being read. Counts are anonymous, not identified people.'}</p><div><Button onClick={()=>navigate(rows.length===1?`/insights?project=${rows[0].projectId}`:'/insights')}>See reads</Button><Button variant="secondary" onClick={()=>{let keys=dismissedSessions.get(session);if(!keys){keys=new Set();dismissedSessions.set(session,keys);}keys.add(key);setDismissedKey({});}}>Dismiss</Button><img className="reads-weekly-character" src="/portalink-heart-character.png" alt="" width="128" height="128" loading="lazy" decoding="async" /></div></aside>;
}
