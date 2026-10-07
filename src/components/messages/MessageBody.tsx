import React from 'react';
import { Link } from 'react-router-dom';

/** Content sent in Portalink opens in the app; arbitrary URLs stay plain text. */
export function messageContentParts(body: string, origin: string) {
 return body.split(/(https?:\/\/[^\s]+)/g).map(text => {
  try {
   const url=new URL(text);
   if(url.origin===origin && /^\/(?:p|share)\/[^/]+\//.test(url.pathname)) return {text,to:url.pathname+url.search+url.hash};
  } catch { /* Ordinary message text. */ }
  return {text,to:null};
 });
}
export function MessageBody({body}: {body:string}) {
 return <>{messageContentParts(body,window.location.origin).map((part,index)=>part.to?<Link key={index} to={part.to} className="underline underline-offset-2">{part.text}</Link>:<React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}
