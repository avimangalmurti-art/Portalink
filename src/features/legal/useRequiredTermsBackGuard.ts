import {useEffect,useRef} from 'react';
/** Keep browser/phone Back inside the mandatory sheet, then remove our entry
 * before continuing signup/onboarding so ordinary navigation keeps its history. */
export function useRequiredTermsBackGuard(required:boolean):()=>Promise<void>{
  const release=useRef<()=>Promise<void>>(()=>Promise.resolve());
  useEffect(()=>{
    if(!required)return;
    const history=window.history,existing=history.state;
    const previous=existing?.portalinkTermsGuard?existing.portalinkTermsPrevious:existing;
    const marker=crypto.randomUUID(),href=window.location.href;
    const guarded={...previous,portalinkTermsGuard:marker,portalinkTermsPrevious:previous};
    if(existing?.portalinkTermsGuard)history.replaceState(guarded,'',href);
    else history.pushState(guarded,'',href);
    let releasing=false,completed=false,pending:Promise<void>|null=null,done:(()=>void)|null=null;
    const remove=()=>{completed=true;window.removeEventListener('popstate',onBack);done?.();};
    const onBack=()=>{
      if(releasing){remove();return;}
      // Restore this same route without changing the reader's open agreement.
      history.pushState(guarded,'',href);
    };
    window.addEventListener('popstate',onBack);
    const finish=()=>{
      if(completed)return Promise.resolve();if(pending)return pending;
      pending=new Promise<void>(resolve=>{done=resolve;releasing=true;
        if(history.state?.portalinkTermsGuard===marker)history.back();else remove();
      });return pending;
    };
    release.current=finish;
    return()=>{void finish();};
  },[required]);
  return ()=>release.current();
}
