import type { Profile, Project } from '../../types/domain';
import type { ProjectDraft } from '../../types/publishing';
import type { ReachSummary } from '../reads/readSignal';

export type DraftResume = ProjectDraft & { stage: 'files' | 'details' | 'review'; cover?: string };
export type StudioActivity = { projectId: string; attachmentId: string; pageIndex: number; page: number; kind: 'reply' | 'read'; at: string };
export type StudioAttentionData = { activity: StudioActivity[]; weeklySaved: number };
export type Attention = { id: string; projectId: string; project: Project; label: string; gap: string; action: 'cover' | 'description' | 'date' | 'reply' | 'read' | 'share'; activity?: StudioActivity };
export const DISMISSAL_DAYS = 30;
const DAY = 86400000;
export function isDismissed(value: unknown, now: number): boolean { return typeof value === 'number' && Number.isFinite(value) && value <= now && now - value < DISMISSAL_DAYS * DAY; }
export function newestDraft(drafts: DraftResume[]): DraftResume | null {
 return [...drafts].sort((a,b)=>(Date.parse(b.updatedAt ?? b.createdAt)||0)-(Date.parse(a.updatedAt ?? a.createdAt)||0)||a.id.localeCompare(b.id))[0] ?? null;
}
export function attentionRows(profile: Profile | null, reach30: ReachSummary[] | undefined, activity: StudioActivity[], dismissed: Record<string, number>, now = Date.now()): Attention[] {
 const projects=profile?.projects ?? [], result: Attention[]=[];
 const add=(project: Project,action: Attention['action'],label: string,gap: string,event?: StudioActivity)=>{if(!isDismissed(dismissed[project.id],now))result.push({id:`${project.id}:${action}${event?`:${event.attachmentId}:${event.pageIndex}`:''}`,projectId:project.id,project,action,label,gap,activity:event});};
 // Global rule priority, with stable project order within a rule. No missing data is inferred as zero.
 for(const p of projects)if(!p.coverThumbnail)add(p,'cover','Set a cover','Cover preview missing');
 for(const p of projects)if(!p.summary.trim() || !Object.values(p.creationDetails?.answers ?? {}).some(v=>v.trim()))add(p,'description','Add a description','Tell the story behind this work');
 for(const p of projects)if(!p.creationDetails?.madeIn?.trim())add(p,'date','When was this made?','Date missing');
 const unique=new Set<string>();
 for(const kind of ['reply','read'] as const)for(const event of [...activity].sort((a,b)=>b.at.localeCompare(a.at))){
  const p=projects.find(p=>p.id===event.projectId),key=`${event.projectId}:${kind}:${event.attachmentId}:${event.pageIndex}`;
  const at=Date.parse(event.at);if(event.kind!==kind||!p||unique.has(key)||!Number.isInteger(event.page)||event.page<0||!Number.isFinite(at)||at>now||(kind==='read'&&now-at>7*DAY))continue;
  unique.add(key);add(p,kind,kind==='reply'?`Reply · page ${event.page+1}`:`See who read page ${event.page+1}`,kind==='reply'?'A comment is waiting':'A member saved or commented',event);
 }
 for(const p of projects){const reach=reach30?.find(r=>r.projectId===p.id),published=Date.parse(p.publishedAt ?? '');if(reach&&reach.opened===0&&Number.isFinite(published)&&now-published>=30*DAY)add(p,'share',`Share ${p.title}`,'No opens in 30 days');}
 // Portal fields and credits have no available canonical capability yet; intentionally off.
 return result;
}
export function visibleAttention(rows: Attention[],showAll=false){return showAll?rows:rows.slice(0,8);}
export function weeklyReads(rows: ReachSummary[] | undefined, saved: number | undefined){return rows&&saved!==undefined?{opened:rows.reduce((n,r)=>n+r.opened,0),finished:rows.reduce((n,r)=>n+r.finished,0),saved,top:[...rows].sort((a,b)=>b.opened-a.opened||b.finished-a.finished||a.projectId.localeCompare(b.projectId)).find(r=>r.opened>0||r.finished>0)}:null;}
