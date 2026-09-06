import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkIcon, HeartIcon, Loader2Icon, MessageCircleIcon, Repeat2Icon, SendIcon, Trash2Icon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useMediaInteractions, type MediaEngagementKind, type MediaInteractionTarget } from './useMediaInteractions';

const ACTIONS: Array<{
  kind: MediaEngagementKind;
  label: string;
  icon: typeof HeartIcon;
  color: string;
}> = [
  { kind: 'like', label: 'Like', icon: HeartIcon, color: 'var(--engagement-like-selected)' },
  { kind: 'save', label: 'Bookmark', icon: BookmarkIcon, color: 'var(--engagement-save-selected)' },
  { kind: 'repost', label: 'Repost', icon: Repeat2Icon, color: 'var(--engagement-repost-selected)' }
];

export function MediaInteractionBar({
  target,
  placement = 'page',
  isOwner = false
}: {
  target: MediaInteractionTarget;
  placement?: 'page' | 'focused';
  /** Derived from authenticated profile ownership, never navigation history. */
  isOwner?: boolean;
}) {
  // Uploaded source names can contain machine-generated or extraction text.
  // They never belong in the social UI, including when the creator views their
  // own work. A stable page number keeps every audience-facing label clean.
  const presentedTarget = useMemo(() => ({
    ...target,
    label: `Page ${target.pageIndex + 1}`
  }), [target.attachmentId, target.pageIndex, target.projectId]);
  const activity = useMediaInteractions(presentedTarget);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activity.commentResumeToken === 0) return;
    setCommentsOpen(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [activity.commentResumeToken]);

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div
    data-media-interaction=""
    data-open={commentsOpen ? 'true' : undefined}
    className={`media-item-engagement absolute z-40 flex max-w-[calc(100%-16px)] gap-2 ${placement === 'focused' ? 'media-item-engagement--focused bottom-2 left-2 flex-col-reverse items-start' : 'bottom-1 left-1 flex-col-reverse items-start'}`}
    onPointerDown={stop}
    onPointerUp={stop}
    onClick={stop}
    onDoubleClick={stop}
    onKeyDown={stop}
  >
    <div data-material="toolbar" role="group" aria-label={`Actions for ${presentedTarget.label}`} className="media-item-engagement-bar side-panel-control-row max-w-full overflow-x-auto rounded-[10px] p-1.5">
      {ACTIONS.map(({ kind, label, icon: Icon, color }) => {
        const engaged = activity.record.engaged[kind];
        const count = activity.record.counts[kind];
        return <button
          key={kind}
          type="button"
          aria-pressed={engaged}
          aria-label={`${engaged ? `Remove ${label.toLowerCase()}` : label}: ${presentedTarget.label}`}
          disabled={activity.pendingKind === kind}
          data-keep-color=""
          style={{ color }}
          onClick={() => activity.toggle(kind)}
          className="media-item-action side-panel-primary-control side-panel-control-row min-w-10 justify-center px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-55"
        >
          {activity.pendingKind === kind
            ? <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <InterfaceIcon icon={Icon} size="sm" weight="regular" keepColor fill={engaged ? color : 'none'} stroke={color} />}
          {count > 0 ? <span className="text-[10px] font-semibold tabular-nums">{count}</span> : null}
        </button>;
      })}
      <button
        type="button"
        aria-expanded={commentsOpen}
        aria-label={`${commentsOpen ? 'Hide' : 'Show'} comments for ${presentedTarget.label}`}
        data-keep-color=""
        style={{ color: 'var(--apple-purple)' }}
        onClick={() => setCommentsOpen((open) => !open)}
        className="media-item-action side-panel-primary-control side-panel-control-row min-w-10 justify-center px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <InterfaceIcon icon={MessageCircleIcon} size="sm" weight="regular" keepColor stroke="var(--apple-purple)" />
        {activity.record.comments.length > 0 ? <span className="text-[10px] font-semibold tabular-nums">{activity.record.comments.length}</span> : null}
      </button>
      <button
        type="button"
        aria-pressed={activity.shareState === 'shared'}
        aria-label={`${activity.shareState === 'shared' ? 'Shared' : 'Share'} ${presentedTarget.label}`}
        data-keep-color=""
        style={{ color: 'var(--engagement-share-selected)' }}
        onClick={() => void activity.share()}
        className="media-item-action side-panel-compact-control shape-compact inline-flex shrink-0 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <InterfaceIcon icon={SendIcon} size="sm" weight="regular" keepColor fill={activity.shareState === 'shared' ? 'var(--engagement-share-selected)' : 'none'} stroke="var(--engagement-share-selected)" />
      </button>
    </div>

    {commentsOpen ? <section aria-label={`Comments for ${presentedTarget.label}`} className="media-comments-popover w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-[14px] text-left">
      <header className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[12px] font-semibold text-white">Comments</h3>
          <p className="truncate text-[10px] text-white/55">{presentedTarget.label}</p>
        </div>
        {activity.isLoading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin text-white/55 motion-reduce:animate-none" aria-label="Loading comments" /> : null}
      </header>
      <div className="scrollbar-overlay max-h-48 overflow-y-auto px-3.5 py-2.5">
        {activity.record.comments.length === 0 && !activity.isLoading && !isOwner ? <p className="py-4 text-center text-[11px] leading-relaxed text-white/55">Be the first to respond to this page.</p> : null}
        <ul className="m-0 list-none space-y-3 p-0">
          {activity.record.comments.map((comment) => <li key={comment.id} className="group/comment">
            <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-[9px] font-semibold text-white/70">
                {comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : comment.authorName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/80">{comment.authorName}</span>
                  {comment.canDelete ? <button type="button" onClick={() => void activity.deleteComment(comment.id)} aria-label="Delete comment" className="flex h-5 w-5 items-center justify-center rounded-full text-white/35 opacity-0 transition-opacity group-hover/comment:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                    <InterfaceIcon icon={Trash2Icon} size="sm" weight="regular" />
                  </button> : null}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/75">{comment.body}</p>
              </div>
            </div>
          </li>)}
        </ul>
      </div>
      <form className="border-t border-white/10 p-2.5" onSubmit={async (event) => {
        event.preventDefault();
        if (await activity.postComment(commentBody)) setCommentBody('');
      }}>
        <div className="flex items-end gap-2 rounded-[10px] bg-white/8 p-2">
          <textarea
            ref={composerRef}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Add a comment"
            aria-label={`Comment on ${presentedTarget.label}`}
            className="min-h-8 min-w-0 flex-1 resize-none bg-transparent text-[11px] leading-relaxed text-white outline-none placeholder:text-white/35"
          />
          <button type="submit" disabled={activity.isPostingComment || !commentBody.trim()} aria-label="Post comment" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-35">
            {activity.isPostingComment ? <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <InterfaceIcon icon={SendIcon} size="sm" weight="medium" />}
          </button>
        </div>
        {activity.failure ? <p role="alert" className="mt-2 text-[10px] leading-relaxed text-[#ff6961]">
          {activity.failure}
          <button type="button" onClick={activity.dismissFailure} className="ml-1.5 font-semibold text-white/65 underline focus:outline-none">Dismiss</button>
        </p> : null}
      </form>
    </section> : null}
  </div>;
}
