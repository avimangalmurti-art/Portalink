import React from 'react';
import {PUBLIC_ORIGIN} from './publicOrigin';
export function ConnectAiPage({onBack}:{onBack:()=>void}){
 const url=PUBLIC_ORIGIN+'/mcp';
 return <section className="studio-workbench-scroll" aria-label="How to connect your AI"><header><button onClick={onBack}>Back</button><h1>How to connect your AI</h1></header><p>Use this connector URL:</p><code>{url}</code><p>Claude: Settings → Connectors → Add custom connector → paste the URL.</p><p>ChatGPT: Enable developer mode, then Settings → Apps → Create app → paste the URL (workspace permission may be required).</p><p>Search and fetch need no Portalink login. Only projects marked Citable can be retrieved. Always include the creator’s name and citation link. Ask your AI to record a citation when you use an item in your document.</p></section>;
}
