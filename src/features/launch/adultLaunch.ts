/** Self-declared eligibility, not identity verification. Never retain a birth date. */
export const LAUNCH_REVIEW_VERSION = 'portalink-controlled-test-2026-10-15-v1';
export const ADMISSION_KEY = 'portalink-adult-launch-v1';
export const OPTIONAL_COLLECTION_ENABLED = false;
let transientBirth: {value:string;expires:number}|null=null;
let birthTimer: ReturnType<typeof setTimeout>|undefined;
export function clearTransientBirth():void {transientBirth=null;if(birthTimer!==undefined)clearTimeout(birthTimer);}
export function takeGoogleBirthDate():string {const value=transientBirth;clearTransientBirth();if(!value||value.expires<=Date.now())throw Error('Check eligibility again before Google sign-in.');return value.value;}
export type LaunchAdmission = { country: 'US'; ageBand: '18+'; checkedAt: number; termsVersion: string; privacyVersion: string; acknowledgedAt: number };
export function isAdultOn(birthDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [y,m,d] = birthDate.split('-').map(Number), date = new Date(Date.UTC(y,m-1,d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m-1 || date.getUTCDate() !== d || y < 1900) return false;
  const age = now.getFullYear()-y-Number(now.getMonth()+1 < m || (now.getMonth()+1 === m && now.getDate() < d));
  return age >= 18;
}
export function validAdmission(value: unknown, now = Date.now()): value is LaunchAdmission {
  if (!value || typeof value !== 'object') return false;
  const a = value as LaunchAdmission;
  return a.country === 'US' && a.ageBand === '18+' && Number.isFinite(a.checkedAt) && a.checkedAt <= now && now-a.checkedAt < 30*60*1000
    && a.termsVersion === LAUNCH_REVIEW_VERSION && a.privacyVersion === LAUNCH_REVIEW_VERSION
    && Number.isFinite(a.acknowledgedAt) && a.acknowledgedAt >= a.checkedAt && a.acknowledgedAt <= now;
}
export function hasRecentScreening(): boolean {
  try {
    const a = JSON.parse(sessionStorage.getItem(ADMISSION_KEY) ?? 'null');
    return a?.country === 'US' && a?.ageBand === '18+' && Number.isFinite(a.checkedAt) && a.checkedAt <= Date.now() && Date.now()-a.checkedAt < 30*60*1000;
  } catch { return false; }
}
export function readAdmission(): LaunchAdmission | null {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(ADMISSION_KEY) ?? 'null'); return validAdmission(value) ? value : null; } catch { return null; }
}
export function saveScreening(country: string, birthDate: string): boolean {
  clearTransientBirth();
  sessionStorage.removeItem(ADMISSION_KEY);
  if (country !== 'US' || !isAdultOn(birthDate)) return false;
  transientBirth={value:birthDate,expires:Date.now()+30*60*1000};
  if(typeof window!=='undefined')birthTimer=setTimeout(clearTransientBirth,30*60*1000);
  sessionStorage.setItem(ADMISSION_KEY, JSON.stringify({country:'US',ageBand:'18+',checkedAt:Date.now()}));
  return true;
}
export function acknowledgeLaunchReview(): void {
  const screened = JSON.parse(sessionStorage.getItem(ADMISSION_KEY) ?? 'null');
  const receipt = {...screened,termsVersion:LAUNCH_REVIEW_VERSION,privacyVersion:LAUNCH_REVIEW_VERSION,acknowledgedAt:Date.now()};
  if (!validAdmission(receipt)) throw new Error('Please check your eligibility again.');
  sessionStorage.setItem(ADMISSION_KEY,JSON.stringify(receipt));
}
export function requireAdmission(): LaunchAdmission {
  const receipt = readAdmission();
  if (!receipt) throw new Error('Complete the US adult eligibility check and review the agreements before creating an account.');
  return receipt;
}
