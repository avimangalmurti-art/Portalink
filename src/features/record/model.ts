export type RecordField = 'identity'|'photo'|'handle'|'headline'|'school'|'new-project'|'date'|'portals'|'icon'|'portal-project'|'citable'|'reference'|'appearance'|'preview'|'share'|'connect-ai'|'summary'|'cover'|'files'|'link';
export type RecordRow = {key:string;label:string;field:RecordField;done?:boolean;available?:boolean;chip?:string;projectId?:string|null;portalId?:string|null;url?:string};
export type OwnerEvent = {event:'snooze'|'never'|'previewed'|'shared'|'visit';key:string;createdAt:string;expiresAt:string|null};
export type RecordStatus = {profileId:string;generatedAt:string;steps:RecordRow[];tidyups:RecordRow[];events:OwnerEvent[];lastSeen:string|null;linkChecksReady:boolean;projectTargets?:Array<{id:string;portalId:string}>;portalTargets?:Array<{id:string;label:string;needsIcon:boolean}>};
export function rowMemory(status:RecordStatus,row:RecordRow,now=Date.now()) {return status.events.some(event=>event.event==='never'&&event.key===row.key)?'never':status.events.some(event=>event.event==='snooze'&&event.key===row.key&&event.expiresAt&&Date.parse(event.expiresAt)>now)?'snoozed':'active';}
export function recordRows(status:RecordStatus,kind:'steps'|'tidyups',now=Date.now()) {return status[kind].filter(row=>row.available!==false&&rowMemory(status,row,now)!=='never').map((row,index)=>({...row,memory:rowMemory(status,row,now),order:index})).sort((a,b)=>Number(a.memory==='snoozed')-Number(b.memory==='snoozed')||Number(Boolean(a.done))-Number(Boolean(b.done))||a.order-b.order);}
export function awayThreeDays(status:RecordStatus,now=Date.now()){return Boolean(status.lastSeen&&Number.isFinite(Date.parse(status.lastSeen))&&now-Date.parse(status.lastSeen)>=3*86400000);}
export function relevantRow(status:RecordStatus,scope:'home'|'publish'|'project'|'portal'|'profile',id?:string,now=Date.now()):RecordRow|undefined {
 const steps=recordRows(status,'steps',now).filter(row=>!row.done&&row.memory==='active'),tidy=recordRows(status,'tidyups',now).filter(row=>row.memory==='active');
 if(scope==='home')return steps[0];
 const target=status.projectTargets?.find(project=>project.id===id);
 const projectStep=steps.find(row=>['date','citable','reference'].includes(row.field)&&(target||row.projectId===id));
 const scopedProjectStep=projectStep&&target?{...projectStep,projectId:target.id,portalId:target.portalId}:projectStep;
 if(scope==='publish')return scopedProjectStep??tidy.find(row=>row.projectId===id);
 if(scope==='project')return tidy.find(row=>row.projectId===id)??scopedProjectStep;
 if(scope==='portal'){
  const portal=status.portalTargets?.find(portal=>portal.id===id),organise=steps.find(row=>row.key==='portals');
  if(portal?.needsIcon&&organise)return {...organise,field:'icon',portalId:portal.id,projectId:null,label:'Give '+portal.label+' an icon'};
  return [...steps,...tidy].find(row=>(row.portalId===id||row.field==='portals'&&portal)&&['icon','portal-project','portals'].includes(row.field));
 }
 return steps.find(row=>['identity','photo','handle','headline','appearance','preview','share'].includes(row.field))??tidy.find(row=>row.field==='link');
}
const UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export function recordHref(profileId:string,row:RecordRow):string {
 if(!UUID.test(profileId))throw new Error('Invalid profile target.');
 const query=new URLSearchParams({record:row.field,key:row.key});
 if(row.url)query.set('url',row.url);
 if(['identity','photo','link','school'].includes(row.field))return '/profile/edit?'+query;
 if(row.field==='appearance')return '/settings?'+query+'#appearance';
 if(['date','citable','summary','cover','files'].includes(row.field)&&!row.projectId)return '/studio?newProject=1';
 if(row.field==='reference')return '/studio?collection=references&'+query+(row.projectId?'&project='+encodeURIComponent(row.projectId):'');
 if(row.field==='new-project')return row.done?'/studio?collection=published':'/studio?newProject=1';
 if(row.field==='portals')return '/p/'+profileId+'?view=portals&'+query;
 if(row.field==='connect-ai')throw new Error('The connector is not live.');
 let route='/p/'+profileId;
 if(row.portalId&&!UUID.test(row.portalId)||row.projectId&&!UUID.test(row.projectId))throw new Error('Invalid record target.');
 if(row.portalId&&UUID.test(row.portalId))route+='/c/'+row.portalId;
 if(row.projectId&&UUID.test(row.projectId)&&!['portals','icon','portal-project'].includes(row.field))route+='/'+row.projectId;
 return route+'?'+query;
}

export function confirmedPublicPreview(value:{path:string;resolvedProfileId?:string;heading:string;hidden:boolean},profileId:string,name:string){
 const legacy=value.path==='/share/'+profileId||value.path==='/share/'+profileId+'/';
 const canonical=/^\/[^/]+\/?$/.test(value.path)&&value.resolvedProfileId===profileId;
 return Boolean((legacy||canonical)&&name&&value.heading.trim()===name.trim()&&!value.hidden);
}
