import React, { useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CompassIcon, FolderOpenIcon, Globe2Icon, LightbulbIcon, RocketIcon, UsersIcon, XIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { usePresentation } from '../../presentation/usePresentation';
import { hasSeenFirstLoginWelcome, rememberFirstLoginWelcome } from './firstLoginWelcomeState';
import './first-login-welcome.css';

export const WELCOME_STEPS = [
  {icon:CompassIcon,title:'Your ideas belong here',description:'Welcome to Portalink. Bring your projects together, tell their stories and let people discover what you create.'},
  {icon:UsersIcon,title:'For every kind of maker',description:'Student, designer, engineer, artist, researcher or curious beginner—there is room for your work here. You do not need a job title to start.'},
  {icon:LightbulbIcon,title:'Share the process, too',description:'Coursework, sketches, experiments and prototypes all count. Show what you tried, what you learned and what you are working toward.'},
  {icon:FolderOpenIcon,title:'Give your projects a home',description:'Organize your work into Portals. Keep a class, a discipline or a personal passion together, and build your portfolio one project at a time.'},
  {icon:Globe2Icon,title:'Let your work travel',description:'Share your portfolio link with classmates, friends and future collaborators. Choose what you make public and share when you feel ready.'},
  {icon:RocketIcon,title:'Start with one project',description:'Choose something you made, give it a title and add your files. A small beginning can tell a big story. Your next idea belongs here, too.'},
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
      <header><button type="button" onClick={onDone} aria-label="Skip Portalink introduction"><InterfaceIcon icon={XIcon}/></button><span>Welcome to Portalink</span><button type="button" onClick={onDone}>Skip</button></header>
      <div className="first-welcome-slide" aria-live="polite" aria-atomic="true"
        onTouchStart={event=>{start.current=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;}}
        onTouchEnd={event=>{const from=start.current;start.current=null;const to=event.changedTouches[0];if(!from||!to)return;const x=to.clientX-from.x,y=to.clientY-from.y;if(Math.abs(x)<60||Math.abs(x)<Math.abs(y)*1.5)return;if(x<0)setStep(value=>Math.min(WELCOME_STEPS.length-1,value+1));else setStep(value=>Math.max(0,value-1));}} onTouchCancel={()=>{start.current=null;}}>
        <div className="first-welcome-art" aria-hidden="true"><span/><InterfaceIcon icon={current.icon}/><span/></div>
        <h1 id="first-welcome-title">{current.title}</h1><p id="first-welcome-description">{current.description}</p>
      </div>
      <footer><nav aria-label="Introduction screens">{WELCOME_STEPS.map((item,index)=><button key={item.title} type="button" aria-label={`Screen ${index+1}: ${item.title}`} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}><span/></button>)}</nav>
        <div className="first-welcome-actions"><button type="button" onClick={back} disabled={step===0}><InterfaceIcon icon={ArrowLeftIcon}/><span>Back</span></button><button type="button" onClick={()=>last?onDone():setStep(step+1)} className="first-welcome-next">{last?"Let’s get started":'Next'}{!last&&<InterfaceIcon icon={ArrowRightIcon}/>}</button></div>
      </footer>
    </section>
  </div></ModalPortal>;
}
