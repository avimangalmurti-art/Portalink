import React, {useState} from 'react';
import {saveScreening,hasRecentScreening} from './adultLaunch';
export function AdultLaunchGate({children,onSignIn,onGuest,guestLabel='Continue as guest'}: {children: React.ReactNode;onSignIn:()=>void;onGuest:()=>void;guestLabel?:string}) {
  const [eligible,setEligible]=useState(hasRecentScreening), [country,setCountry]=useState(''), [birth,setBirth]=useState(''), [error,setError]=useState('');
  if (eligible) return <>{children}</>;
  return <form className="one-screen-entry" onSubmit={event=>{event.preventDefault();try {const values=new FormData(event.currentTarget);const ok=saveScreening(String(values.get('country')??''),String(values.get('birthDate')??''));setBirth('');if(ok)setEligible(true);else setError('Account registration is currently available only to United States residents ages 18 or older. You can continue as a guest.');}catch{setError('Eligibility could not be saved. Enable browser session storage and try again.');}}}>
    <h1>Check account eligibility</h1><p>Choose your country of residence and enter your date of birth. Your full birth date is not saved.</p>
    <label>Country of residence<select name="country" required value={country} onChange={e=>setCountry(e.target.value)} className="text-control w-full p-3"><option value="">Choose a country</option><option value="CA">Canada</option><option value="MX">Mexico</option><option value="US">United States</option><option value="other">Another country</option></select></label>
    <label>Date of birth<input name="birthDate" required type="date" value={birth} onChange={e=>setBirth(e.target.value)} className="text-control w-full p-3" /></label>
    {error&&<p role="alert">{error}</p>}<button className="entry-email" type="submit">Continue</button>
    <div className="entry-links"><button type="button" onClick={onSignIn}>Already have an account? Sign in</button><button type="button" onClick={onGuest}>{guestLabel}</button></div>
  </form>;
}
