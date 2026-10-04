import { useEffect, type RefObject } from 'react';

/** Keep the transcript readable while the existing viewport host follows iOS. */
export function useConversationKeyboard(enabled: boolean, conversationId: string | null, frameRef: RefObject<HTMLElement>, scrollerRef: RefObject<HTMLDivElement>, composerRef: RefObject<HTMLTextAreaElement>) {
  useEffect(() => {
    const frame = frameRef.current;
    if (!enabled || !frame) return;
    const viewport = window.visualViewport;
    let closedHeight = viewport?.height ?? window.innerHeight;
    let session: { top: number; atBottom: boolean; opened: boolean } | null = null;
    let animation = 0;
    let settle = 0;
    const cancel = () => { cancelAnimationFrame(animation); window.clearTimeout(settle); };
    const update = () => {
      const scroller = scrollerRef.current;
      const focused = document.activeElement === composerRef.current;
      if (focused && !session && scroller) {
        session = { top: scroller.scrollTop, atBottom: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 80, opened: false };
      }
      const height = viewport?.height ?? window.innerHeight;
      // Compare with the pre-focus visible height: Safari may also shrink innerHeight.
      const keyboard = Boolean(session && closedHeight - height > 120);
      cancel();
      if (keyboard && session) {
        session.opened = true;
        frame.setAttribute('data-conversation-keyboard', '');
        animation = requestAnimationFrame(() => {
          if (scroller) scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        });
      } else if (session?.opened) {
        // Blur can precede the keyboard animation. Restore after viewport events settle.
        settle = window.setTimeout(() => {
          const previous = session;
          session = null;
          frame.removeAttribute('data-conversation-keyboard');
          closedHeight = viewport?.height ?? window.innerHeight;
          animation = requestAnimationFrame(() => {
            if (previous && scroller) scroller.scrollTop = previous.atBottom
              ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
              : Math.min(previous.top, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
          });
        }, 180);
      } else if (!focused) {
        session = null;
        closedHeight = height;
        frame.removeAttribute('data-conversation-keyboard');
      }
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (scrollerRef.current) observer?.observe(scrollerRef.current);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancel();
      observer?.disconnect();
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      frame.removeAttribute('data-conversation-keyboard');
    };
  }, [enabled, conversationId, frameRef, scrollerRef, composerRef]);
}
