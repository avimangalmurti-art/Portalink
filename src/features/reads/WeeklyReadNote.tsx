import React,{useCallback,useEffect,useRef,useState} from 'react';
import { useNavigate } from 'react-router-dom';
import { useServices } from '../../contexts/ServicesContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { currentWeek } from './readSignal';
import { Button } from '../../components/ui/Button';
import './reads.css';
import { motionMs, motionEase } from '../../presentation/motion/motion';
import { usePresentation } from '../../presentation/usePresentation';
const dismissedSessions = new WeakMap<object, Set<string>>();
/** Dismiss only for this login; readership itself always comes from D1. */
export function WeeklyReadNote({startupPending=false,startupAttempt=0,onStartupSettled}:{startupPending?:boolean;startupAttempt?:number;onStartupSettled?:(settled:boolean)=>void}={}){
  const {reads}=useServices(),auth=useAuth(),navigate=useNavigate();const week=currentWeek(new Date()),key=`portalink.reads.dismissed:${auth.user?.id??''}:${week}`;
  const isMobile=usePresentation()==='mobile';
  const fallbackSession=useRef({});
  const session=auth.loginSession??fallbackSession.current;
  const cardRef=useRef<HTMLElement>(null);
  const closing=useRef<Animation|null>(null);
  useEffect(()=>()=>{const animation=closing.current;closing.current=null;animation?.cancel();},[]);
  const [,setDismissedKey]=useState<object|null>(null);
  const dismissed=dismissedSessions.get(session)?.has(key)??false;
  const load=useCallback(()=>reads?reads.list():Promise.resolve([]),[reads]);const state=useAccountQuery(load);
  const retry=useRef(state.retry);retry.current=state.retry;
  const previousAttempt=useRef(startupAttempt);
  useEffect(()=>{if(startupPending&&previousAttempt.current!==startupAttempt)retry.current();previousAttempt.current=startupAttempt;},[startupPending,startupAttempt]);
  const settled=!auth.user||dismissed||!state.loading;
  useEffect(()=>{onStartupSettled?.(settled);},[onStartupSettled,settled,startupAttempt]);
  const rows=state.data?.filter(row=>row.weekly.opened>0)??[],opened=rows.reduce((sum,row)=>sum+row.weekly.opened,0),finished=rows.reduce((sum,row)=>sum+row.weekly.finished,0);
  const dismiss=()=>{
    if(closing.current)return;
    let keys=dismissedSessions.get(session);if(!keys){keys=new Set();dismissedSessions.set(session,keys);}keys.add(key);
    const card=cardRef.current;
    const duration=card?.closest('[data-presentation="mobile"]')?motionMs('base'):0;
    if(!card?.animate||!duration){setDismissedKey({});return;}
    const animation=card.animate([
      {height:`${card.getBoundingClientRect().height}px`,opacity:1,transform:'translateY(0) scale(1)'},
      {height:'0px',opacity:0,transform:'translateY(-4px) scale(.98)',paddingTop:'0px',paddingBottom:'0px',marginTop:'0px',marginBottom:'0px',borderWidth:'0px'},
    ],{duration,easing:motionEase('exit'),fill:'forwards'});
    closing.current=animation;
    card.style.overflow='hidden';card.style.pointerEvents='none';
    const finish=()=>{if(closing.current!==animation)return;closing.current=null;setDismissedKey({});};
    void animation.finished.then(finish,finish);
  };
  if(!auth.user||(dismissed&&!closing.current)||state.loading||state.error||!state.data||(isMobile&&opened===0&&finished===0))return null;
  return <aside ref={cardRef} className="reads-weekly" aria-label="This week">
    <small>This week</small>
    {isMobile ? <ul className="reads-weekly-metrics">
      <li>{opened} project opens.</li>
      <li>{finished} reads reached the end.</li>
    </ul> : <>
      <h2>{opened} project opens. {finished} reads reached the end.</h2>
      <p>{opened > 0 ? 'Your work is being read. These are anonymous tab counts, not identified people.' : 'Share your work and check back to see how it’s being read. Counts are anonymous, not identified people.'}</p>
    </>}
    <div>
      <Button onClick={() => navigate(rows.length === 1 ? `/insights?project=${rows[0].projectId}` : '/insights')}>See reads</Button>
      <Button variant="secondary" onClick={dismiss}>Dismiss</Button>
    </div>
  </aside>;
}
