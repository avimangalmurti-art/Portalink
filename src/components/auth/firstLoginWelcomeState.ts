const completed = new Set<string>();
const key = (accountId:string) => `portalink:welcome:v1:${accountId}`;
/** Non-sensitive UI preference only; profile existence remains the account-wide gate. */
export function hasSeenFirstLoginWelcome(accountId:string):boolean {
  if(completed.has(accountId))return true;
  try{return localStorage.getItem(key(accountId))==='done';}catch{return false;}
}
export function rememberFirstLoginWelcome(accountId:string) {
  completed.add(accountId);
  try{localStorage.setItem(key(accountId),'done');}catch{/* Blocked storage never blocks setup. */}
}
