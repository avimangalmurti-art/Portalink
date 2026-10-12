import {createContext,useContext} from 'react';
import type {LegalVersion} from './model';
export const SignupTermsContext=createContext<{requestConsent:(email:string)=>Promise<LegalVersion[]|null>}|null>(null);
export function useSignupTerms(){
  return useContext(SignupTermsContext)??{requestConsent:async()=>{throw new Error('The agreements are temporarily unavailable. Please try again.');}};
}
