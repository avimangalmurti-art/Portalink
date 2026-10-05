import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { readSharedReturnPath } from '../auth/registration';
import { Button } from '../../components/ui/Button';
import { useContext } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MobilePageContext } from './MobilePageContext';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import React, { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookmarkIcon, HeartIcon, Loader2Icon, MessageCircleIcon, Repeat2Icon, SendIcon, Trash2Icon, XIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useMediaInteractions, type MediaEngagementKind, type MediaInteractionTarget } from './useMediaInteractions';
import { mediaToolbarLayout, mobileFocusedMediaToolbarLayout } from './mediaToolbarLayout';
import { usePresentation } from '../../presentation/usePresentation';
import { useMediaPageSize } from './useMediaPageSize';
import { MediaCommentsPopover } from './MediaCommentsPopover';
import { publicMediaUrl } from '../media/publicMediaUrl';

const ProjectFormDialog = lazy(() => import('../../components/publishing/ProjectFormDialog').then(module => ({ default: module.ProjectFormDialog })));
const countFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const displayCount = (count: number) => count > 0 ? countFormatter.format(count) : '';

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
  pageCount,
  isOwner = false,
  contextOnly = false
}: {
  contextOnly?: boolean;
  target: MediaInteractionTarget;
  placement?: 'page' | 'focused';
  /** The focused attachment's total, separate from its engagement counts. */
  pageCount?: number;
  /** Derived from authenticated profile ownership, never navigation history. */
  isOwner?: boolean;
}) {
  const [deleteCommentId,setDeleteCommentId]=useState<string|null>(null);
  const [deletingComment,setDeletingComment]=useState(false);
  const isMobile = usePresentation() === 'mobile';
  const isMobileFocused = isMobile && placement === 'focused';
  // Uploaded source names can contain machine-generated or extraction text.
  // They never belong in the social UI, including when the creator views their
  // own work. A stable page number keeps every audience-facing label clean.
  const presentedTarget = useMemo(() => ({
    ...target,
    label: `Page ${target.pageIndex + 1}`
  }), [target.attachmentId, target.pageIndex, target.projectId]);
  const { ref: engagementRef, pageWidth, hostWidth, isVisible } = useMediaPageSize();
  const activity = useMediaInteractions(presentedTarget, contextOnly || isVisible);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const commentsTriggerRef = useRef<HTMLButtonElement>(null);
  const commentsId = useId();
  const closeComments = useCallback(() => setCommentsOpen(false), []);
  const counts = [...ACTIONS.map(({ kind }) => displayCount(activity.record.counts[kind])), displayCount(activity.record.comments.length)];
  const counter = !isMobileFocused && placement === 'focused' && pageCount && pageCount > 1
    ? `${target.pageIndex + 1} / ${pageCount}` : null;
  const counterWidth = counter ? Math.min(Math.max(48, counter.length * 7 + 20), Math.max(0, (hostWidth - 24) * 0.4)) : 0;
  const layout = isMobileFocused ? mobileFocusedMediaToolbarLayout(hostWidth)
    : mediaToolbarLayout(pageWidth, hostWidth, placement === 'focused' ? 8 : 4, counts, counter ? counterWidth + 8 : 0);

  useEffect(() => {
    setCommentsOpen(false);
    setCommentBody('');
  }, [target.projectId, target.attachmentId, target.pageIndex]);

  useEffect(() => {
    if (activity.commentResumeToken === 0) return;
    setCommentsOpen(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [activity.commentResumeToken]);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!isMobile || !composer) return;
    composer.style.height = '0px';
    composer.style.height = `${Math.min(112, Math.max(44, composer.scrollHeight))}px`;
  }, [commentBody, commentsOpen, isMobile]);

  const auth = useAuth(), currentPage = useContext(MobilePageContext);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (auth.isAuthenticated && isOwner && query.get('comments') === '1' && query.get('media') === target.attachmentId && Number(query.get('page')) === target.pageIndex + 1) setCommentsOpen(true);
  }, [auth.isAuthenticated, isOwner, target.projectId, target.attachmentId, target.pageIndex]);
  const sharedPath = isMobile && !auth.isAuthenticated ? readSharedReturnPath(window.location.pathname + window.location.search) : undefined;
  const sharedGuest = isMobile && !auth.isAuthenticated && Boolean(currentPage?.shared || sharedPath);
  const requireAccount = () => {
    if (!sharedGuest) return false;
    const path = sharedPath || window.location.pathname + window.location.search;
    auth.requestAuthenticatedDestination({ kind: 'route', path, label: 'engage with this page' }, 'signUp');
    return true;
  };
  const current = currentPage?.projectId === target.projectId && currentPage.attachmentId === target.attachmentId && currentPage.pageIndex === target.pageIndex;
  useMobileScreenActions(current ? contextActions(currentPage?.shared ? 'shared' : 'project', { signedIn: auth.isAuthenticated, owner: isOwner }, { handlers: {
    savePage: sharedGuest || (!activity.isResolvingEngagement && activity.pendingKind !== 'save') ? () => savePage() : undefined,
    comment: () => { if (!requireAccount()) setCommentsOpen(true); },
  }, labels: { savePage: activity.record.engaged.save ? 'Unsave this page' : 'Save this page' } }) : null, 15);
  const [saveChoice,setSaveChoice]=useState(false);
  useEffect(()=>setSaveChoice(false),[presentedTarget.attachmentId,presentedTarget.pageIndex,auth.user?.id]);
  const savePage=()=>{if(requireAccount())return;if(auth.isAuthenticated && !activity.record.engaged.save)setSaveChoice(true);else activity.toggle('save');};
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div
    ref={engagementRef}
    data-media-interaction=""
    data-context-only={contextOnly || undefined}
    data-open={commentsOpen ? 'true' : undefined}
    className={`media-item-engagement absolute z-40 flex gap-2 ${placement === 'focused' ? 'media-item-engagement--focused bottom-2 left-2 flex-col-reverse items-start' : 'bottom-1 left-1 flex-col-reverse items-start'}`}
    style={{ maxWidth: `calc(100% - ${placement === 'focused' ? 16 : 8}px)` }}
    onPointerDown={stop}
    onPointerUp={stop}
    onClick={stop}
    onDoubleClick={stop}
    onKeyDown={stop}
  >
    {saveChoice && <Suspense fallback={null}><ProjectFormDialog title="Save this page" titleId="page-save-choice" onClose={()=>setSaveChoice(false)}><div className="p-5 grid gap-3"><p>Keep this bookmark private, or let the creator know you saved this page. Sharing shows your profile name to this creator.</p><Button disabled={activity.pendingKind==='save'} onClick={async()=>{if(await activity.savePrivately())setSaveChoice(false);}}>Save privately</Button><Button disabled={activity.pendingKind==='save'} variant="secondary" onClick={async()=>{if(await activity.saveWithCreator())setSaveChoice(false);}}>Save and let the creator know</Button>{activity.failure&&<p role="alert">{activity.failure}</p>}</div></ProjectFormDialog></Suspense>}
    <div hidden={contextOnly} data-media-controls-row="" className="flex max-w-full items-center gap-2">
    <div data-material="media-overlay" role="group" aria-label={`Actions for ${presentedTarget.label}`} className="media-item-engagement-bar shrink-0" style={{
      width: layout.width,
      '--media-action-unit': `${layout.unit}px`,
      gridTemplateColumns: layout.slots.map((slot) => `${slot}fr`).join(' ')
    } as React.CSSProperties}>
      {ACTIONS.map(({ kind, label, icon: Icon, color }, index) => {
        const engaged = activity.record.engaged[kind];
        const count = activity.record.counts[kind];
        return <button
          key={kind}
          type="button"
          aria-pressed={engaged}
          aria-label={`${engaged ? `Remove ${label.toLowerCase()}` : label}: ${presentedTarget.label}${count > 0 ? ` (${count})` : ''}`}
          title={`${label}: ${count}`}
          disabled={!sharedGuest && (activity.pendingKind === kind || activity.isResolvingEngagement)}
          data-keep-color=""
          style={{ color }}
          onClick={() => { if (!requireAccount()) { if (kind === 'save') savePage(); else activity.toggle(kind); } }}
          className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-55"
        >
          {activity.pendingKind === kind
            ? <Loader2Icon className="media-item-action-loader animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <InterfaceIcon icon={Icon} size="sm" weight="regular" keepColor fill={engaged ? color : 'none'} stroke={color} />}
          {count > 0 ? <span className="media-item-action-count font-semibold tabular-nums">{counts[index]}</span> : null}
        </button>;
      })}
      <button
        ref={commentsTriggerRef}
        type="button"
        aria-expanded={commentsOpen}
        aria-controls={commentsOpen ? commentsId : undefined}
        aria-label={`${commentsOpen ? 'Hide' : 'Show'} comments for ${presentedTarget.label}${counts[3] ? ` (${activity.record.comments.length})` : ''}`}
        title={`Comments: ${activity.record.comments.length}`}
        data-keep-color=""
        style={{ color: 'var(--apple-purple)' }}
        onClick={() => { if (!requireAccount()) setCommentsOpen((open) => !open); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && commentsOpen) {
            event.preventDefault();
            event.stopPropagation();
            closeComments();
          }
        }}
        className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <InterfaceIcon icon={MessageCircleIcon} size="sm" weight="regular" keepColor stroke="var(--apple-purple)" />
        {counts[3] ? <span className="media-item-action-count font-semibold tabular-nums">{counts[3]}</span> : null}
      </button>
      <button
        type="button"
        aria-pressed={activity.shareState === 'shared'}
        aria-label={`${activity.shareState === 'shared' ? 'Shared' : 'Share'} ${presentedTarget.label}`}
        data-keep-color=""
        style={{ color: 'var(--engagement-share-selected)' }}
        onClick={() => { if (!requireAccount()) void activity.share(); }}
        className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <InterfaceIcon icon={SendIcon} size="sm" weight="regular" keepColor fill={activity.shareState === 'shared' ? 'var(--engagement-share-selected)' : 'none'} stroke="var(--engagement-share-selected)" />
      </button>
    </div>

    {counter ? <span data-media-page-count="" aria-label={`Page ${target.pageIndex + 1} of ${pageCount}`} className="premium-viewer-page-counter premium-viewer-page-counter--inline pointer-events-none shrink-0 rounded-full px-2 py-1 text-center text-[12px] font-medium tabular-nums text-white" style={{ width: counterWidth }}>{counter}</span> : null}
    </div>

    {activity.failure && activity.isResolvingEngagement && !commentsOpen ? <button
      type="button"
      onClick={() => void activity.retry()}
      aria-label={`Retry page activity for ${presentedTarget.label}`}
      className="min-h-11 max-w-full rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] px-3 text-[12px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
    >Activity unavailable · Retry</button> : null}

    {commentsOpen ? <MediaCommentsPopover id={commentsId} label={`Comments for ${presentedTarget.label}`} anchorRef={engagementRef} triggerRef={commentsTriggerRef} onClose={closeComments}>
      <header data-comments-header="" className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[12px] font-semibold text-white">Comments</h3>
          <p className="truncate text-[10px] text-white/55">{presentedTarget.label}{isMobile && pageCount ? ` of ${pageCount}` : ''}</p>
        </div>
        {isMobile ? <button type="button" data-comments-close="" onClick={closeComments} aria-label="Close comments"><InterfaceIcon icon={XIcon} size="lg" weight="medium" /></button> : null}
        {!isMobile && activity.isLoading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin text-white/55 motion-reduce:animate-none" aria-label="Loading comments" /> : null}
      </header>
      {isMobile || activity.record.comments.length > 0 || !isOwner ? <div data-comments-list="" className="scrollbar-overlay max-h-48 overflow-y-auto overscroll-contain px-3.5 py-2.5">
        {activity.record.comments.length === 0 && !activity.isLoading && (!isMobile || !activity.failure) && (isMobile || !isOwner) ? <p data-comments-empty="" className="py-4 text-center text-[11px] leading-relaxed text-white/55">{isMobile ? 'No comments yet.' : 'Be the first to respond to this page.'}</p> : null}
        {isMobile && activity.isLoading ? <p role="status" data-comments-empty="">Loading comments…</p> : null}
        <ul className="m-0 list-none space-y-3 p-0">
          {activity.record.comments.map((comment) => <li key={comment.id} data-comment="" className="group/comment">
            <div className="flex items-start gap-2">
              <span data-comment-avatar="" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden squircle bg-white/10 text-[9px] font-semibold text-white/70">
                {comment.authorAvatarUrl ? <img src={publicMediaUrl(comment.authorAvatarUrl)} alt="" loading="lazy" decoding="async" width={24} height={24} className="h-full w-full object-cover" /> : comment.authorName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span data-comment-author="" className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/80">{comment.authorName}</span>
                  {comment.canDelete ? <button type="button" onClick={() => { activity.dismissFailure();setDeleteCommentId(comment.id); }} aria-label="Delete comment" data-comment-delete="" className="flex h-5 w-5 items-center justify-center rounded-full text-white/35 opacity-0 transition-opacity group-hover/comment:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                    <InterfaceIcon icon={Trash2Icon} size="sm" weight="regular" />
                  </button> : null}
                </div>
                <p data-comment-body="" className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/75">{comment.body}</p>
              </div>
            </div>
          </li>)}
        </ul>
      </div> : null}
      <form data-comments-composer="" className="p-2.5" onSubmit={async (event) => {
        event.preventDefault();
        if (await activity.postComment(commentBody)) setCommentBody('');
      }}>
        <div data-comments-input="" className={isMobile ? 'field-shell text-control-shell' : 'flex items-end gap-2 rounded-[10px] bg-white/8 p-2'}>
          <textarea
            ref={composerRef}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            rows={isMobile ? 1 : 2}
            maxLength={1000}
            placeholder="Add a comment"
            aria-label={`Comment on ${presentedTarget.label}`}
            className="min-h-8 min-w-0 flex-1 resize-none bg-transparent text-[11px] leading-relaxed text-white outline-none placeholder:text-white/35"
          />
          <button type="submit" data-keep-color="" disabled={activity.isPostingComment || !commentBody.trim()} aria-label="Post comment" data-comment-send="" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-35">
            {activity.isPostingComment ? <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <InterfaceIcon icon={SendIcon} size="sm" weight="medium" />}
          </button>
        </div>
        {activity.failure ? <p data-comment-failure="" role="alert" className="mt-2 text-[10px] leading-relaxed text-[#ff6961]">
          {activity.failure}
          <button type="button" onClick={() => void activity.retry()} className="ml-1.5 min-h-11 font-semibold text-white/65 underline focus-visible:outline focus-visible:outline-2">Try again</button>
          {!activity.isResolvingEngagement ? <button type="button" onClick={activity.dismissFailure} className="ml-1.5 font-semibold text-white/65 underline focus:outline-none">Dismiss</button> : null}
        </p> : null}
      </form>
    </MediaCommentsPopover> : null}
    {deleteCommentId && <ConfirmationDialog title="Delete this comment?" description="This page comment will be permanently removed." confirmLabel="Delete comment" variant="destructive" pending={deletingComment} pendingLabel="Deleting…" error={activity.failure} onCancel={()=>setDeleteCommentId(null)} onConfirm={async()=>{setDeletingComment(true);try{const removed=await activity.deleteComment(deleteCommentId);if(removed)setDeleteCommentId(null);return removed;}finally{setDeletingComment(false);}}}/>}
  </div>;
}
