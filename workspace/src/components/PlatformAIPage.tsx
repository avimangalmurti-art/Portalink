import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowUpIcon, MicIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import { InterfaceIcon } from './ui/InterfaceIcon';

const STUDIO_UNAVAILABLE_MESSAGE = 'AI chat is not connected yet. Your message was not sent.';

/**
 * Studio is intentionally a truthful shell until a real conversational backend
 * is connected. The former screen rendered hand-authored analytics and matched
 * keywords to canned answers, which made prototype data look measured. This
 * screen contains no metrics, recommendations, or generated claims.
 */
export function PlatformAIPage({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 176)}px`;
  }, [query]);

  function submit() {
    if (!query.trim()) return;
    setNotice(STUDIO_UNAVAILABLE_MESSAGE);
  }

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <header className="ps-panel-toolbar global-control-header relative shrink-0 justify-between px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="ps-btn ps-btn-secondary inline-flex h-9 items-center gap-2 rounded-[10px] px-2 text-[14px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <InterfaceIcon icon={ArrowLeftIcon} size="sm" weight="medium" mirroredInRtl />
          Back
        </button>
        <p className="absolute left-1/2 -translate-x-1/2 text-[14px] font-semibold">Studio</p>
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)]" role="status">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-disabled)]" aria-hidden="true" />
          AI unavailable
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="mb-7 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--icon-secondary)]">
              <InterfaceIcon icon={SparklesIcon} size="md" weight="medium" />
            </span>
            <h1 className="mt-4 text-[28px] font-semibold tracking-[-0.025em] sm:text-[32px]">How can Studio help?</h1>
            <p className="mx-auto mt-2 max-w-[520px] text-[14px] leading-6 text-[var(--text-secondary)]">
              Ask about published work, develop an idea, or attach source material once AI is connected.
            </p>
          </div>

          <div className="w-full">
            <div className="text-control-shell rounded-[28px] px-3 pb-2.5 pt-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
              <textarea
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (notice) setNotice(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder="Ask Studio"
                aria-label="Message Studio"
                className="type-chat-body block max-h-44 min-h-[34px] w-full resize-none overflow-y-auto bg-transparent px-2 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />

              <div className="mt-1 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled
                  aria-label="Add files — unavailable"
                  title="File attachments are not available yet"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--icon-disabled)]"
                >
                  <InterfaceIcon icon={PlusIcon} size="sm" weight="medium" />
                </button>
                <span className="text-[12px] text-[var(--text-tertiary)]">AI is not connected</span>

                <div className="ml-auto flex items-center gap-1.5">
                  {!query.trim() && (
                    <button
                      type="button"
                      disabled
                      aria-label="Voice input — unavailable"
                      title="Voice input is not available yet"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--icon-disabled)]"
                    >
                      <InterfaceIcon icon={MicIcon} size="sm" weight="medium" />
                    </button>
                  )}
                  {query.trim() && (
                    <button
                      type="button"
                      onClick={submit}
                      aria-label="Send message"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-inverse)] text-[var(--text-inverse)] transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                    >
                      <InterfaceIcon icon={ArrowUpIcon} size="sm" weight="semibold" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-3 min-h-5 text-center text-[12px] leading-5 text-[var(--text-tertiary)]" aria-live="polite">
              {notice ?? 'Nothing typed here is sent or stored while AI is unavailable.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
