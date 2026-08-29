import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, CheckIcon, ChevronDownIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { ContextualAction } from './ContextualAction';
import type { GenerationState } from '../../features/studio/useStudioGeneration';
import { studioContexts, type ForYouInsight, type StudioActionKey } from '../../utils/studioQuery';
export type StudioTurn = {
  id: string;
  author: 'you' | 'studio';
  text: string;
  observation?: string;
  /** Present on Studio turns that produced a visualization. */
  hasVisualization?: boolean;
};
export type PanelStatus = 'idle' | 'thinking' | 'resolved';
type AiStudioPanelProps = {
  turns: StudioTurn[];
  /** Follow-ups once a conversation exists; starter prompts before that. */
  followUps: {
    label: string;
    questions: string[];
  };
  explore: string[];
  insight: ForYouInsight;
  query: string;
  action: StudioActionKey;
  /** The generative lifecycle, owned by `useStudioGeneration` in the page. */
  generation: GenerationState;
  status: PanelStatus;
  onQueryChange: (value: string) => void;
  onAsk: (question: string) => void;
  onFocusVisualization: () => void;
};
const toneVar: Record<ForYouInsight['tone'], string> = {
  gaze: 'var(--studio-gaze)',
  success: 'var(--studio-success)',
  warning: 'var(--studio-warning)',
  affinity: 'var(--studio-affinity)'
};

/**
 * The entry point to Studio's intelligence: a composer, one live insight, and
 * openings into the creator's own work, creators around them, and the wider
 * landscape. Neutral throughout — colour appears only where it means something.
 */
export function AiStudioPanel({
  turns,
  followUps,
  explore,
  insight,
  query,
  action,
  generation,
  status,
  onQueryChange,
  onAsk,
  onFocusVisualization
}: AiStudioPanelProps) {
  const hasConversation = turns.length > 0;
  const composer = <Composer query={query} status={status} onQueryChange={onQueryChange} onAsk={onAsk} />;
  const prompts = <PromptList label={hasConversation ? followUps.label : 'Explore'} questions={hasConversation ? followUps.questions : explore} onAsk={onAsk} />;
  return <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0">
        <div className="flex items-center gap-2">
          <SparklesIcon data-keep-color="" className="h-4 w-4 shrink-0" style={{
          color: 'var(--studio-indigo)'
        }} aria-hidden="true" />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em]">AI Studio</h2>
          {status !== 'idle' && <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--studio-text-tertiary)]">
              {status === 'thinking' ? <>
                  <Loader2Icon data-keep-color="" className="h-3 w-3 animate-spin motion-reduce:animate-none" style={{
              color: 'var(--studio-pending)'
            }} aria-hidden="true" />
                  Analysing
                </> : <>
                  <CheckIcon data-keep-color="" className="h-3 w-3" style={{
              color: 'var(--studio-success)'
            }} aria-hidden="true" />
                  Answered
                </>}
            </span>}
        </div>
        <p className="mt-2 text-[12px] leading-[1.45] text-[var(--studio-text-muted)]">Explore your work and what’s happening around it.</p>
      </header>

      {/* Before a conversation: composer, one insight, then the openings. */}
      {!hasConversation && <div className="mt-4 flex min-h-0 flex-1 flex-col">
          {composer}
          <div className="mt-5 shrink-0">
            <SectionLabel>For you</SectionLabel>
            <p className="mt-1.5 text-[13px] leading-[1.45] text-[var(--studio-text)]">
              {insight.text.split('{emphasis}').map((fragment, index) => <React.Fragment key={index}>
                  {fragment}
                  {index === 0 && <span data-keep-color="" className="font-semibold tabular-nums" style={{
              color: toneVar[insight.tone]
            }}>{insight.emphasis}</span>}
                </React.Fragment>)}
            </p>
            <button type="button" onClick={() => onAsk(insight.question)} className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-[6px] text-[12px] font-semibold transition-colors duration-150 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]" style={{
          color: 'var(--studio-accent)'
        }}>
              {insight.prompt}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">{prompts}</div>
        </div>}

      {/* Once asking begins, the transcript leads and the composer moves down. */}
      {hasConversation && <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {turns.map((turn) => <li key={turn.id} className="list-none">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--studio-text-tertiary)]">
                    {turn.author === 'studio' && <SparklesIcon data-keep-color="" className="h-2.5 w-2.5" style={{
                color: 'var(--studio-indigo)'
              }} aria-hidden="true" />}
                    {turn.author === 'you' ? 'You' : 'Studio'}
                  </p>
                  <p className="type-chat-body mt-1 text-[var(--studio-text)]">{turn.text}</p>
                  {turn.observation && <p className="mt-1 text-[12px] leading-[1.45] text-[var(--studio-text-muted)]">{turn.observation}</p>}
                  {turn.hasVisualization && <button type="button" onClick={onFocusVisualization} className="mt-1.5 inline-flex h-7 cursor-pointer items-center rounded-[8px] border border-[var(--studio-hairline-strong)] px-2 text-[11px] font-semibold text-[var(--studio-text-muted)] transition-colors duration-150 hover:border-[var(--studio-accent)] hover:text-[var(--studio-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
                      Show me
                    </button>}
                </li>)}
            </ul>
            {action && <div className="mt-4">
                <ContextualAction action={action} generation={generation} />
              </div>}
          </div>
          <div className="mt-3 shrink-0 border-t border-[var(--studio-hairline)] pt-3">
            {prompts}
            <div className="mt-3">{composer}</div>
          </div>
        </div>}
    </div>;
}
function SectionLabel({
  children


}: {children: React.ReactNode;}) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--studio-text-tertiary)]">{children}</p>;
}

/** Editorial rows, not cards: the question is the whole target. */
function PromptList({
  label,
  questions,
  onAsk




}: {label: string;questions: string[];onAsk: (question: string) => void;}) {
  return <div>
      <SectionLabel>{label}</SectionLabel>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
        {questions.map((question) => <li key={question} className="list-none">
            <button type="button" onClick={() => onAsk(question)} className="group/ask flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-[9px] px-2 py-2 text-left text-[13px] leading-[1.4] text-[var(--studio-text)] transition-colors duration-150 hover:bg-[var(--studio-elevated)] active:bg-[var(--studio-pressed)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
              <span className="min-w-0 flex-1">{question}</span>
              <span aria-hidden="true" data-keep-color="" className="shrink-0 text-[12px] opacity-0 transition-opacity duration-150 group-hover/ask:opacity-100 group-focus-visible/ask:opacity-100" style={{
            color: 'var(--studio-accent)'
          }}>→</span>
            </button>
          </li>)}
      </ul>
    </div>;
}

/** The strongest control in the panel: a multi-line composer with its context. */
function Composer({
  query,
  status,
  onQueryChange,
  onAsk





}: {query: string;status: PanelStatus;onQueryChange: (value: string) => void;onAsk: (question: string) => void;}) {
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [activeContexts, setActiveContexts] = useState<string[]>([...studioContexts]);
  const contextRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isContextOpen) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!contextRef.current?.contains(event.target as Node)) {
        setIsContextOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isContextOpen]);
  const canSend = query.trim().length > 0;
  const contextLabel = activeContexts.length === studioContexts.length ? 'Context' : activeContexts.length === 0 ? 'No context' : `${activeContexts.length} contexts`;
  return <div className="text-control-shell rounded-[12px] p-2.5">
      <textarea value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (canSend) {
          onAsk(query);
        }
      }
    }} rows={2} placeholder="Ask Studio anything…" aria-label="Ask Studio anything" className="type-chat-body block max-h-[120px] min-h-[40px] w-full resize-none bg-transparent text-[var(--studio-text)] placeholder:text-[var(--studio-text-tertiary)] outline-none" />

      <div className="mt-1.5 flex items-center gap-2">
        <div ref={contextRef} className="relative min-w-0">
          {/* Only contexts the product actually holds. */}
          <button type="button" onClick={() => setIsContextOpen((open) => !open)} aria-haspopup="menu" aria-expanded={isContextOpen} className="flex h-7 max-w-full cursor-pointer items-center gap-1 rounded-[7px] px-1.5 text-[11px] font-medium text-[var(--studio-text-muted)] transition-colors duration-150 hover:bg-[var(--studio-inset)] hover:text-[var(--studio-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
            <span className="truncate">{contextLabel}</span>
            <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
          {isContextOpen && <div role="menu" className="absolute bottom-8 left-0 z-30 w-44 rounded-[10px] border border-[var(--studio-hairline-strong)] bg-[var(--studio-panel-a)] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
              {studioContexts.map((context) => {
            const isOn = activeContexts.includes(context);
            return <button key={context} type="button" role="menuitemcheckbox" aria-checked={isOn} onClick={() => setActiveContexts((current) => current.includes(context) ? current.filter((item) => item !== context) : [...current, context])} className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-[var(--studio-text)] transition-colors duration-150 hover:bg-[var(--studio-inset)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]">
                    <CheckIcon data-keep-color="" className={`h-3 w-3 shrink-0 ${isOn ? '' : 'opacity-0'}`} style={{
                color: 'var(--studio-accent)'
              }} aria-hidden="true" />
                    {context}
                  </button>;
          })}
            </div>}
        </div>

        <button type="button" onClick={() => canSend && onAsk(query)} disabled={!canSend} aria-label="Ask Studio" data-keep-color="" className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus-ring)]" style={{
        backgroundColor: canSend ? 'var(--studio-accent)' : 'var(--studio-inset)',
        color: canSend ? 'var(--studio-accent-foreground)' : 'var(--studio-text-disabled)'
      }}>
          {status === 'thinking' ? <Loader2Icon className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>;
}
