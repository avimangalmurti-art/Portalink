import React from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_ORIGIN } from '../../features/citations/publicOrigin';
import { isPublicSharePath } from '../../features/sharing/shareModel';

/** Content sent in Portalink opens in the app; arbitrary URLs stay plain text. */
export function messageContentParts(body: string, origin: string) {
 return body.split(/(https?:\/\/[^\s]+)/g).map(text => {
  try {
   const url=new URL(text);
   const trusted = url.origin === origin || url.origin === PUBLIC_ORIGIN
     || url.origin === 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
   if(trusted && !url.username && !url.password && (/^\/p\/[^/]+\//.test(url.pathname) || isPublicSharePath(url.pathname))) {
    const to = url.pathname + url.search + url.hash;
    return {text: new URL(to.replace(/^\/p\//, '/share/'), PUBLIC_ORIGIN).href, to};
   }
  } catch { /* Ordinary message text. */ }
  return {text,to:null};
 });
}
export function MessageBody({body}: {body:string}) {
 return <>{messageContentParts(body,window.location.origin).map((part,index)=>part.to?<Link key={index} to={part.to} className="underline underline-offset-2">{part.text}</Link>:<React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}
