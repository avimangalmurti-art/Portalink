import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PUBLIC_ORIGIN } from '../../features/citations/publicOrigin';
import { isPublicSharePath } from '../../features/sharing/shareModel';
import { parseSharedContentLink } from '../../features/messages/sharedContentPreview';
import { SharedContentMessagePreview } from './SharedContentMessagePreview';

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
export function MessageBody({body, previewLinks = false}: {body:string; previewLinks?:boolean}) {
 const parts = useMemo(() => messageContentParts(body, window.location.origin).map(part => ({ ...part,
  target: previewLinks && part.to ? parseSharedContentLink(new URL(part.to, PUBLIC_ORIGIN).href, PUBLIC_ORIGIN) : null,
 })), [body, previewLinks]);
 return <>{parts.map((part,index)=> {
  const { target } = part;
  return target ? <SharedContentMessagePreview key={`${index}:${part.to}`} target={target} /> : part.to ? <Link key={index} to={part.to} className="underline underline-offset-2">{part.text}</Link> : <React.Fragment key={index}>{part.text}</React.Fragment>;
 })}</>;
}
