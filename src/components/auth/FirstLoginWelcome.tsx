import React, { useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import { hasSeenFirstLoginWelcome, rememberFirstLoginWelcome } from './firstLoginWelcomeState';
import './first-login-welcome.css';

export const WELCOME_STEPS = [
  {artwork:'/onboarding/welcome.webp',title:'All your ideas belong in one place',description:'Build a catalogue of everything you imagine, make and explore.'},
  {artwork:'/onboarding/makers.webp',title:'Every idea counts',description:'From quick sketches to finished work, it all belongs here.'},
  {artwork:'/onboarding/process.webp',title:'Keep the process',description:'Add notes, sketches and experiments as your ideas develop.'},
  {artwork:'/onboarding/portals.webp',title:'Create your Portals',description:'Group related ideas by project, topic or interest.'},
  {artwork:'/onboarding/share.webp',title:'Share your catalogue',description:'Choose what’s public and share your ideas when you’re ready.'},
  {artwork:'/onboarding/start.webp',title:'Start with one idea',description:'Give it a title, add what you have and keep building.'},
] as const;

/** Mount the creator setup only after this optional introduction has finished. */
export function FirstLoginWelcome({accountId,children}:{accountId:string;children:React.ReactNode}) {
  const [done,setDone]=useState(()=>hasSeenFirstLoginWelcome(accountId));
  if(done)return <>{children}</>;
  return <WelcomeTour onDone={()=>{rememberFirstLoginWelcome(accountId);setDone(true);}}/>;
}
function WelcomeTour({onDone}:{onDone:()=>void}) {
  const [step,setStep]=useState(0);
  const start=useRef<{x:number;y:number}|null>(null);
  const dialog=useRef<HTMLElement>(null),viewport=useDialogViewport();
  const presentation=usePresentation();
  useModalFocus(true,dialog,onDone,true);
  const current=WELCOME_STEPS[step],last=step===WELCOME_STEPS.length-1;
  const back=()=>step>0?setStep(step-1):onDone();
  return <ModalPortal><div ref={viewport} className="first-login-welcome-backdrop modal-scrim" data-presentation={presentation}>
    <ScreenBack action={back}>{null}</ScreenBack>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="first-welcome-title" aria-describedby="first-welcome-description" tabIndex={-1} className="first-login-welcome" data-ui-surface="popup">
      <header><button type="button" onClick={onDone} aria-label="Skip Portalink introduction" data-ui-shape="icon"><InterfaceIcon icon={XIcon}/></button><span>Welcome to Portalink</span><button type="button" onClick={onDone} data-ui-shape="action">Skip</button></header>
      <div className="first-welcome-slide" aria-live="polite" aria-atomic="true"
        onTouchStart={event=>{start.current=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;}}
        onTouchEnd={event=>{const from=start.current;start.current=null;const to=event.changedTouches[0];if(!from||!to)return;const x=to.clientX-from.x,y=to.clientY-from.y;if(Math.abs(x)<60||Math.abs(x)<Math.abs(y)*1.5)return;if(x<0)setStep(value=>Math.min(WELCOME_STEPS.length-1,value+1));else setStep(value=>Math.max(0,value-1));}} onTouchCancel={()=>{start.current=null;}}>
        <div className="first-welcome-art" aria-hidden="true"><img src={current.artwork} alt="" width="1024" height="1024" draggable={false}/></div>
        <h1 id="first-welcome-title">{current.title}</h1><p id="first-welcome-description">{current.description}</p>
      </div>
      <footer><nav aria-label="Introduction screens">{WELCOME_STEPS.map((item,index)=><button key={item.title} type="button" aria-label={`Screen ${index+1}: ${item.title}`} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}><span/></button>)}</nav>
        <div className="first-welcome-actions"><button type="button" onClick={back} disabled={step===0}><InterfaceIcon icon={ArrowLeftIcon}/><span>Back</span></button><button type="button" onClick={()=>last?onDone():setStep(step+1)} className="first-welcome-next">{last?"Let’s get started":'Next'}{!last&&<InterfaceIcon icon={ArrowRightIcon}/>}</button></div>
      </footer>
    </section>
  </div></ModalPortal>;
}
