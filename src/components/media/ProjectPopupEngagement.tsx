import { useProjectComments } from '../../features/comments/useProjectComments';
import { MessageCircleIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
import React from 'react';
import { EngagementBar } from '../../features/engagement/EngagementBar';
import type { ProjectEngagementLifecycle } from '../../features/engagement/useProjectEngagement';

export function ProjectPopupEngagement({ projectId, projectTitle, engagement, onRequireAccount, onOpenComments }: { projectId: string; projectTitle: string; url: string; engagement: ProjectEngagementLifecycle; onRequireAccount?: () => void; onOpenComments?: () => void }) {
 const comments = useProjectComments(onOpenComments ? projectId : null);
 return <div className="project-popup-engagement" data-has-comments={Boolean(onOpenComments) || undefined}>
  <EngagementBar leadingAction={onOpenComments && <button type="button" data-engagement-action="comments" aria-label={`Comments: ${projectTitle}`} onClick={onOpenComments}><span className="grid grid-cols-[auto_auto] items-center justify-items-center gap-x-1.5 gap-y-1.5"><InterfaceIcon icon={MessageCircleIcon} size="lg" />{comments.phase === 'ready' && <span className="text-[13px] font-medium tabular-nums">{comments.totalCount}</span>}</span></button>} engagement={engagement} projectTitle={projectTitle} showCounts variant="panel" onRequireAccount={onRequireAccount} />

 </div>;
}
