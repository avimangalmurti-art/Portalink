import { ownPageCitation } from '../references/ownCitation';
import { useCiteTarget } from '../citations/useCiteTarget';
import { ConfirmationDialog } from '../../components/ui/ConfirmationDialog';
import { readSharedReturnPath } from '../auth/registration';
import { useContext } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { MobilePageContext } from './MobilePageContext';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookmarkIcon, HeartIcon, Loader2Icon, MessageCircleIcon, QuoteIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useMediaInteractions, type MediaEngagementKind, type MediaInteractionTarget } from './useMediaInteractions';
import { mediaToolbarLayout, mobileFocusedMediaToolbarLayout } from './mediaToolbarLayout';
import { usePresentation } from '../../presentation/usePresentation';
import { useMediaPageSize } from './useMediaPageSize';
import { MediaCommentsPopover } from './MediaCommentsPopover';
import { publicMediaUrl } from '../media/publicMediaUrl';

const countFormatter = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const displayCount = (count: number) => count > 0 ? countFormatter.format(count) : '';

const ACTIONS: Array<{
  kind: MediaEngagementKind;
  label: string;
  icon: typeof HeartIcon;
}> = [
  { kind: 'save', label: 'Save', icon: BookmarkIcon },

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
  const pageInset = placement === 'focused' ? 8 : 4;
  const layout = isMobileFocused ? mobileFocusedMediaToolbarLayout(hostWidth)
    : mediaToolbarLayout(pageWidth, hostWidth, pageInset, counts, counter ? counterWidth + 8 : 0);
  const actionColumns = isMobileFocused || !isOwner ? 4 : 3;
  const minimumWidth = isMobileFocused ? 196 : actionColumns * 44;
  // A dense desktop overview can be narrower than its buttons and their gaps.
  const paddingAndGaps = (12 + (actionColumns - 1) * 4) * layout.unit;
  const compactDesktopPage = !isMobile && placement === 'page' &&
    Math.min(pageWidth, hostWidth) - pageInset * 2 < minimumWidth + paddingAndGaps;

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
  const [citationStatus,setCitationStatus]=useState('');
  const copyIdentity=useRef<string|null>(null);
  copyIdentity.current=`${auth.user?.id??''}:${target.projectId}:${target.attachmentId}:${target.pageIndex}`;
  useEffect(()=>()=>{copyIdentity.current=null;},[]);
  useEffect(()=>setCitationStatus(''),[target.attachmentId,target.pageIndex,auth.viewerProfileId]);
  const citation = useCiteTarget(target.attachmentId,target.pageIndex,isVisible || contextOnly);
  const current = currentPage?.projectId === target.projectId && currentPage.attachmentId === target.attachmentId && currentPage.pageIndex === target.pageIndex;
  useMobileScreenActions(current ? contextActions(currentPage?.shared ? 'shared' : 'project', { signedIn: auth.isAuthenticated, owner: isOwner }, { handlers: {
    copyCitation: isOwner&&auth.viewerProfileId?async()=>{const identity=copyIdentity.current;try{const text=await ownPageCitation(auth.viewerProfileId!,target.projectId,target.attachmentId,target.pageIndex);if(copyIdentity.current!==identity)return;await navigator.clipboard.writeText(text);setCitationStatus('Citation copied.');}catch(caught){if(copyIdentity.current===identity)setCitationStatus(caught instanceof Error?caught.message:'Citation could not be copied.');}}:undefined,
    cite: () => citation.open(),
    share: () => activity.share(),
    savePage: sharedGuest || (!activity.isResolvingEngagement && activity.pendingKind !== 'save') ? () => savePage() : undefined,
    comment: () => { if (!requireAccount()) setCommentsOpen(true); },
  }, labels: { savePage: activity.record.engaged.save ? 'Unsave this page' : 'Save this page' } }) : null, 15);
  const [saveChoice,setSaveChoice]=useState<false|true|{scope:string;revision:number}>(false),[saveRetry,setSaveRetry]=useState(false);
  const [saveSuccess,setSaveSuccess]=useState<{scope:string;revision:number}|null>(null);
  const saveScope=JSON.stringify([isMobile,presentedTarget.projectId,presentedTarget.attachmentId,presentedTarget.pageIndex,auth.user?.id]);
  const saveSession=useRef({scope:saveScope,revision:0,active:true,confirmed:false});
  if(saveSession.current.scope!==saveScope){saveSession.current.scope=saveScope;saveSession.current.revision+=1;saveSession.current.confirmed=false;}
  const saveRevision=saveSession.current.revision;
  const showingSave=isMobile?typeof saveChoice==='object'&&saveChoice.scope===saveScope&&saveChoice.revision===saveRevision:saveChoice===true;
  const saved=isMobile&&showingSave&&saveSuccess?.scope===saveScope&&saveSuccess.revision===saveRevision;
  useEffect(()=>{const session=saveSession.current;session.active=true;return()=>{session.active=false;session.revision+=1;};},[]);
  useEffect(()=>{setSaveChoice(false);setSaveSuccess(null);if(isMobile)setSaveRetry(false);},[isMobile,presentedTarget.projectId,presentedTarget.attachmentId,presentedTarget.pageIndex,auth.user?.id]);
  const closeSave=useCallback(()=>{if(isMobile){saveSession.current.revision+=1;saveSession.current.confirmed=false;}setSaveChoice(false);setSaveSuccess(null);},[isMobile]);
  useEffect(()=>{
    if(!saved)return;
    const session=saveSession.current,revision=saveRevision;
    const timer=setTimeout(()=>{
      if(session.active&&session.scope===saveScope&&session.revision===revision&&session.confirmed)closeSave();
    },800);
    return()=>clearTimeout(timer);
  },[saved,saveScope,saveRevision,closeSave]);
  const savePage=()=>{
    if(requireAccount())return;
    if(auth.isAuthenticated && !activity.record.engaged.save){
      if(isMobile){saveSession.current.revision+=1;saveSession.current.confirmed=false;setSaveSuccess(null);setSaveRetry(false);activity.dismissFailure();}
      setSaveChoice(isMobile?{scope:saveScope,revision:saveSession.current.revision}:true);
    }else activity.toggle('save');
  };
  const confirmSave=async()=>{
    if(!isMobile){activity.toggle('save');setSaveChoice(false);return true;}
    const session=saveSession.current,revision=saveRevision;
    if(!session.active||session.scope!==saveScope||session.revision!==revision||session.confirmed)return false;
    const confirmed=await activity.saveWithCreator();
    if(!session.active||session.scope!==saveScope||session.revision!==revision)return false;
    if(confirmed===true){session.confirmed=true;setSaveSuccess({scope:saveScope,revision});}else setSaveRetry(true);
    return confirmed===true;
  };
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <div
    ref={engagementRef}
    data-media-interaction=""
    data-context-only={contextOnly || undefined}
    data-open={commentsOpen ? 'true' : undefined}
    className={`media-item-engagement absolute z-40 flex gap-2 ${placement === 'focused' ? 'media-item-engagement--focused bottom-2 left-2 flex-col-reverse items-start' : 'bottom-1 left-1 flex-col-reverse items-start'}`}
    style={{ maxWidth: `calc(100% - ${pageInset * 2}px)` }}
    onPointerDown={stop}
    onPointerUp={stop}
    onClick={stop}
    onDoubleClick={stop}
    onKeyDown={stop}
  >
    {citation.surface}
    {citation.citedIn}
    {showingSave && <ConfirmationDialog key={isMobile?`${saveScope}:${saveRevision}`:undefined} title={saved?'Page saved':'Save this page?'} description={saved?'This page has been saved privately in your Bookmarks.':'This page will be saved privately in your Bookmarks.'} confirmLabel={isMobile&&saveRetry?'Retry':'Save'} successLabel={saved?'Saved':undefined} cancelLabel={saved?'Done':undefined} pendingLabel="Saving…" pending={activity.pendingKind==='save'} error={activity.failure} onCancel={closeSave} onConfirm={confirmSave}/>}
    <div hidden={contextOnly} data-media-controls-row="" className="flex max-w-full items-center gap-2">
    <div data-material="media-overlay" role="group" aria-label={`Actions for ${presentedTarget.label}`} className="media-item-engagement-bar shrink-0" style={{
      width: layout.width,
      '--media-action-unit': `${layout.unit}px`,
      gridTemplateColumns: `repeat(${actionColumns}, minmax(${compactDesktopPage ? '0px' : '44px'}, 1fr))`,
      minWidth: compactDesktopPage ? 0 : minimumWidth
    } as React.CSSProperties}>
      {ACTIONS.map(({ kind, label, icon: Icon }, index) => {
        const engaged = activity.record.engaged[kind];
        const count = activity.record.counts[kind];
        return <button
          key={kind}
          type="button"
          aria-pressed={engaged}
          aria-label={`${engaged ? `Remove ${label.toLowerCase()}` : label}: ${presentedTarget.label}${count > 0 ? ` (${count})` : ''}`}
          title={`${label}: ${count}`}
          disabled={!sharedGuest && (activity.pendingKind === kind || activity.isResolvingEngagement)}
          onClick={() => { if (!requireAccount()) { if (kind === 'save') savePage(); else activity.toggle(kind); } }}
          className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-55"
        >
          {activity.pendingKind === kind
            ? <Loader2Icon className="media-item-action-loader animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <InterfaceIcon icon={Icon} size="sm" weight="regular" keepColor fill={engaged ? 'currentColor' : 'none'} stroke="currentColor" />}
          {count > 0 ? <span className="media-item-action-count font-semibold tabular-nums">{counts[index]}</span> : null}
        </button>;
      })}
      <button
        ref={commentsTriggerRef}
        type="button"
        aria-expanded={commentsOpen}
        aria-controls={commentsOpen ? commentsId : undefined}
        aria-label={`${commentsOpen ? 'Hide' : 'Show'} comments for ${presentedTarget.label}${counts[ACTIONS.length] ? ` (${activity.record.comments.length})` : ''}`}
        title={`Comments: ${activity.record.comments.length}`}
        onClick={() => { if (!requireAccount()) setCommentsOpen((open) => !open); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && commentsOpen) {
            event.preventDefault();
            event.stopPropagation();
            closeComments();
          }
        }}
        className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <InterfaceIcon icon={MessageCircleIcon} size="sm" weight="regular" keepColor stroke="currentColor" />
        {counts[ACTIONS.length] ? <span className="media-item-action-count font-semibold tabular-nums">{counts[ACTIONS.length]}</span> : null}
      </button>
      <button type="button" aria-label="Cite this page" title="Cite" onClick={()=>void citation.open()} className="media-item-action"><InterfaceIcon icon={QuoteIcon} size="sm" weight="regular" keepColor /></button>
      <button
        type="button"
        aria-pressed={activity.shareState === 'shared'}
        aria-label={`${activity.shareState === 'shared' ? 'Shared' : 'Share'} ${presentedTarget.label}`}
        onClick={() => { if (!requireAccount()) void activity.share(); }}
        className="media-item-action focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <InterfaceIcon icon={SendIcon} size="sm" weight="regular" keepColor fill={activity.shareState === 'shared' ? 'currentColor' : 'none'} stroke="currentColor" />
      </button>
    </div>

    {citationStatus&&<span role="status">{citationStatus}</span>}
    {counter ? <span data-media-page-count="" aria-label={`Page ${target.pageIndex + 1} of ${pageCount}`} className="premium-viewer-page-counter premium-viewer-page-counter--inline pointer-events-none shrink-0 rounded-full px-2 py-1 text-center text-[12px] font-medium tabular-nums text-white" style={{ width: counterWidth }}>{counter}</span> : null}
    </div>

    {activity.failure && activity.isResolvingEngagement && !commentsOpen ? <button
      type="button"
      onClick={() => void activity.retry()}
      aria-label={`Retry page activity for ${presentedTarget.label}`}
      className="min-h-11 max-w-full rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] px-3 text-[12px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
    >Activity unavailable Â· Retry</button> : null}

    {commentsOpen ? <MediaCommentsPopover id={commentsId} label={`Comments for ${presentedTarget.label}`} anchorRef={engagementRef} triggerRef={commentsTriggerRef} onClose={closeComments} mobileMotion>{dismiss => <>
      <header data-comments-header="" className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[12px] font-semibold text-white">Comments</h3>
          <p className="truncate text-[10px] text-white/55">{presentedTarget.label}{isMobile && pageCount ? ` of ${pageCount}` : ''}</p>
        </div>
        {isMobile ? <button type="button" data-comments-close="" data-ui-shape="icon" onClick={dismiss} aria-label="Close comments"><InterfaceIcon icon={XIcon} size="lg" weight="medium" /></button> : null}
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
                  {comment.canDelete ? <button type="button" onClick={() => { activity.dismissFailure();setDeleteCommentId(comment.id); }} aria-label="Delete comment" data-comment-delete="" className="flex h-5 w-5 items-center justify-center rounded-full text-white/35 opacity-0 transition-opacity group-hover/comment:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
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
        <div data-comments-input="" data-ui-shape="composer" className={isMobile ? 'field-shell text-control-shell' : 'flex items-end gap-2 rounded-[10px] bg-white/8 p-2'}>
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
          <button type="submit" data-keep-color="" data-ui-shape="icon" disabled={activity.isPostingComment || !commentBody.trim()} aria-label="Post comment" data-comment-send="" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-35">
            {activity.isPostingComment ? <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <InterfaceIcon icon={SendIcon} size="sm" weight="medium" />}
          </button>
        </div>
        {activity.failure ? <p data-comment-failure="" role="alert" className="mt-2 text-[10px] leading-relaxed text-[#ff6961]">
          {activity.failure}
          <button type="button" onClick={() => void activity.retry()} className="ml-1.5 min-h-11 font-semibold text-white/65 underline focus-visible:outline focus-visible:outline-2">Try again</button>
          {!activity.isResolvingEngagement ? <button type="button" onClick={activity.dismissFailure} className="ml-1.5 font-semibold text-white/65 underline focus:outline-none">Dismiss</button> : null}
        </p> : null}
      </form>
    </>}</MediaCommentsPopover> : null}
    {deleteCommentId && <ConfirmationDialog title="Delete this comment?" description="This page comment will be permanently removed." confirmLabel="Delete comment" variant="destructive" pending={deletingComment} pendingLabel="Deleting…" error={activity.failure} onCancel={()=>setDeleteCommentId(null)} onConfirm={async()=>{setDeletingComment(true);try{const removed=await activity.deleteComment(deleteCommentId);if(removed)setDeleteCommentId(null);return removed;}finally{setDeletingComment(false);}}}/>}
  </div>;
}
