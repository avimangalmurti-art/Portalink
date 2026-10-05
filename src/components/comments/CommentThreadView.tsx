import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import React from 'react';
import { AlertCircleIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { COMMENT_MAX_LENGTH } from '../../types/comments';
import type { Comment } from '../../types/comments';
import type { CommentComposerState, ProjectCommentsLifecycle } from '../../features/comments/useProjectComments';
import { ResponsiveImage } from '../ui/ResponsiveImage';

/**
 * The conversation on a project, rendered on the canonical project detail rather
 * than on a page of its own — a comment belongs beside the work it is about.
 *
 * Purely presentational: it reads the lifecycle and calls it. It knows nothing
 * about services, authentication, or optimism.
 *
 * State is never colour alone: pending writes are labelled "Posting…", deletion is
 * labelled, and every failure pairs an icon with words.
 */
export function CommentThreadView({
  comments,
  projectTitle,
  isOwner = false



}: {comments: ProjectCommentsLifecycle;projectTitle: string;isOwner?: boolean;}) {
  const topLevelPending = comments.pending.filter((item) => item.parentId === null);
  // One rhythm throughout: heading to field, field to button, comment to
  // comment all sit on the same 10px step, so no gap reads as a section break
  // that is not one.
  return <section aria-label={`Comments on ${projectTitle}`} className="flex w-full flex-col gap-2.5">
      {/* A section label, not a control: no glyph, flush to the leading edge. The
         count is only appended once the read has actually returned one. */}
      <header>
        <h3 className="text-left text-[13px] font-semibold text-[var(--text-primary)]">
          Comment section{comments.phase === 'ready' && comments.totalCount > 0 ? ` (${comments.totalCount})` : ''}
        </h3>
      </header>

      {/* Writing is offered to everyone: a guest's press opens the sign-in gate,
         which is more useful than an inert box with no explanation. */}
      <Composer state={comments.composer} label={`Add a comment on ${projectTitle}`} placeholder="Add a comment" submitLabel="Post" onChange={comments.setBody} onSubmit={comments.submit} />

      {comments.phase === 'loading' ? <p role="status" className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading comments…
        </p> : comments.phase === 'error' ? <p role="alert" className="flex items-center gap-1.5 text-[12px] leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {comments.loadError}
            <button type="button" onClick={comments.reload} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>
          </span>
        </p> : <ul role="list" className="m-0 flex list-none flex-col gap-2.5 p-0 inset-row-group inset-row-group-icons">
          {comments.isEmpty && !isOwner && <li className="text-[12px] text-[var(--text-secondary)]">No comments yet. Be the first to say something.</li>}
          {comments.threads.map((thread) => <li key={thread.comment.id} className="flex flex-col gap-2.5">
              <CommentRow comment={thread.comment} comments={comments} />

              {(thread.replies.length > 0 || comments.replyingToId === thread.comment.id || comments.pending.some((item) => item.parentId !== null)) && <ul role="list" className="m-0 ml-6 flex list-none flex-col gap-2.5 border-l border-[var(--border-subtle)] pl-3.5 p-0">
                  {thread.replies.map((reply) => <li key={reply.id}>
                      <CommentRow comment={reply} comments={comments} isReply />
                    </li>)}
                  {/* A reply that has not been confirmed yet, shown as pending. */}
                  {comments.pending.filter((item) => item.parentId !== null && (item.parentId === thread.comment.id || thread.replies.some((reply) => reply.id === item.parentId))).map((item) => <li key={item.localId}><PendingRow body={item.body} /></li>)}
                  {comments.replyingToId !== null && (comments.replyingToId === thread.comment.id || thread.replies.some((reply) => reply.id === comments.replyingToId)) && <li>
                      <Composer state={comments.replyComposer} label="Write a reply" placeholder="Write a reply" submitLabel="Reply" onChange={comments.setReplyBody} onSubmit={comments.submitReply} onCancel={comments.cancelReply} autoFocus />
                    </li>}
                </ul>}
            </li>)}
          {topLevelPending.map((item) => <li key={item.localId}><PendingRow body={item.body} /></li>)}
        </ul>}
    </section>;
}
function CommentRow({
  comment,
  comments,
  isReply = false




}: {comment: Comment;comments: ProjectCommentsLifecycle;isReply?: boolean;}) {
  const isConfirmingDelete = comments.deletionRequestId === comment.id;
  const deletion = comments.deletion?.commentId === comment.id ? comments.deletion : null;
  return <article className="flex min-w-0 gap-2.5">
      {comment.author.avatarUrl ? <ResponsiveImage src={comment.author.avatarUrl} decorative width={28} height={28} sizes="28px" className="h-7 w-7 shrink-0 squircle object-cover" /> : <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center squircle bg-[var(--surface-sunken)] text-[10px] font-semibold text-[var(--text-secondary)]">{comment.author.initials}</span>}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[12px]">
          <span className="font-semibold text-[var(--text-primary)]">{comment.author.name}</span>
          <time dateTime={comment.createdAt} className="text-[11px] text-[var(--text-tertiary)]">{formatWhen(comment.createdAt)}</time>
        </p>
        <p className="type-chat-body mt-0.5 whitespace-pre-wrap break-words text-[var(--text-primary)]">{comment.body}</p>

        <div className="mt-1 flex items-center gap-3">
          <button type="button" onClick={() => comments.startReply(comment.id)} className="text-[11px] font-semibold text-[var(--text-secondary)] underline transition-colors hover:text-[var(--text-primary)] focus:outline-none">Reply</button>
          {/* Offered only to the author, as the service decided. */}
          {comment.canDelete && !isConfirmingDelete && <button type="button" onClick={() => comments.requestDelete(comment.id)} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] underline focus:outline-none hover:text-[var(--text-primary)]">
              <Trash2Icon className="h-3 w-3" aria-hidden="true" />
              Delete
            </button>}
        </div>

        {/* Destructive, so it is confirmed before anything is sent — and the
           comment stays on screen until the service confirms its removal. */}
        {isConfirmingDelete && <ConfirmationDialog title={`Delete this ${isReply ? 'reply' : 'comment'}?`} description={isReply ? 'This reply will be permanently removed.' : 'This comment and its replies will be permanently removed.'} confirmLabel={isReply ? 'Delete reply' : 'Delete comment'} variant="destructive" pending={deletion?.isDeleting} pendingLabel="Deleting…" error={deletion?.error} onCancel={comments.cancelDelete} onConfirm={comments.confirmDelete}/>}
      </div>
    </article>;
}

/** A write the service has not confirmed. Explicitly not a posted comment. */
function PendingRow({
  body


}: {body: string;}) {
  return <article aria-busy="true" className="flex min-w-0 gap-2.5 opacity-70">
      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
        <Loader2Icon className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)] motion-reduce:animate-none" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p role="status" className="text-[11px] font-semibold text-[var(--text-secondary)]">Posting…</p>
        <p className="type-chat-body mt-0.5 whitespace-pre-wrap break-words text-[var(--text-secondary)]">{body}</p>
      </div>
    </article>;
}
function Composer({
  state,
  label,
  placeholder,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
  autoFocus = false









}: {state: CommentComposerState;label: string;placeholder: string;submitLabel: string;onChange: (body: string) => void;onSubmit: () => void;onCancel?: () => void;autoFocus?: boolean;}) {
  const errorId = `${label.replace(/\s+/g, '-').toLowerCase()}-error`;
  return <form onSubmit={(event) => {
    event.preventDefault();
    onSubmit();
  }} className="flex flex-col gap-2.5">
      <label className="sr-only" htmlFor={errorId + '-field'}>{label}</label>
      <textarea id={errorId + '-field'} value={state.body} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={2} maxLength={COMMENT_MAX_LENGTH} autoFocus={autoFocus} aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? errorId : undefined} disabled={state.isSubmitting} className="text-control type-chat-body w-full resize-y px-2.5 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]" />
      <div className="flex items-center gap-2.5">
        {/* Disabled while a request is in flight, so one press cannot become two. */}
        {/* The same 8px the field above it carries, so the two read as one
           composer rather than a pill parked under a panel. */}
        <button type="submit" disabled={state.isSubmitting} className="side-panel-primary-control flex items-center bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-[var(--accent-foreground)] transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
          {state.isSubmitting ? 'Posting…' : submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel} disabled={state.isSubmitting} className="text-[11px] font-semibold text-[var(--text-secondary)] underline focus:outline-none disabled:opacity-60">Cancel</button>}
      </div>
      {/* The text itself is preserved above; this only says what went wrong. */}
      {state.error && <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[11px] leading-relaxed text-[var(--text-primary)]">
          <AlertCircleIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            {state.error}
            {state.retry && <button type="button" onClick={state.retry} className="ml-1.5 font-semibold text-[var(--accent-text)] underline focus:outline-none">Try again</button>}
          </span>
        </p>}
    </form>;
}

/** A readable stamp without pulling in a date library for one line of text. */
function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) {
    return '';
  }
  const minutes = Math.round((Date.now() - when.getTime()) / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)}h ago`;
  }
  return when.toLocaleDateString();
}
