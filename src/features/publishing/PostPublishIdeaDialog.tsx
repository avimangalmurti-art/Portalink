import React, { useEffect, useRef } from 'react';
import { ArrowRightIcon, XIcon } from 'lucide-react';
import { ModalPortal } from '../../components/ui/ModalPortal';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import { useModalFocus } from '../../hooks/useModalFocus';
import { usePresentation } from '../../presentation/usePresentation';
import './post-publish-idea.css';

/** App owns confirmed publication and destination selection for this surface. */
export function PostPublishIdeaDialog({ onClose, onViewIdea, onOpenCatalogue }: {
  onClose: () => void;
  onViewIdea: () => void;
  onOpenCatalogue: () => void;
}) {
  const viewport = useDialogViewport();
  const dialog = useRef<HTMLElement>(null);
  const presentation = usePresentation();
  const close = useRef(onClose);
  close.current = onClose;
  useModalFocus(true, dialog, onClose, true);
  useEffect(() => {
    const openedHref = window.location.href;
    const onPop = () => {
      // Finishing mobile authoring may consume a same-URL history stop.
      // Web transitions can commit the destination after this effect mounts.
      if (presentation !== 'mobile' || window.location.href !== openedHref) close.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [presentation]);

  return <ModalPortal><div ref={viewport} className="post-publish-idea-backdrop modal-scrim" data-presentation={presentation}
    onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="post-publish-idea-title" aria-describedby="post-publish-idea-description" tabIndex={-1}
      className="post-publish-idea-dialog" data-material="content" data-ui-surface={presentation === 'mobile' ? 'sheet' : 'popup'}>
      <header>
        <button type="button" aria-label="Close published project confirmation" data-ui-control="icon" data-control-variant="ghost" onClick={onClose}><XIcon size={20} aria-hidden="true"/></button>
        <span>Portalink</span><span className="post-publish-idea-header-spacer" aria-hidden="true"/>
      </header>
      <div className="post-publish-idea-content">
        <div className="post-publish-idea-art" aria-hidden="true"><img src="/onboarding/share.webp" alt="" width="1254" height="1254" draggable={false}/></div>
        <h1 id="post-publish-idea-title">Your project is published</h1>
        <p id="post-publish-idea-description">Your catalogue is growing.</p>
      </div>
      <footer>
        <button type="button" className="post-publish-idea-primary" data-ui-control="button" data-control-variant="primary" onClick={onViewIdea}>View project<ArrowRightIcon size={20} aria-hidden="true"/></button>
        <button type="button" className="post-publish-idea-catalogue" data-ui-control="button" data-control-variant="ghost" onClick={onOpenCatalogue}>My catalogue</button>
      </footer>
    </section>
  </div></ModalPortal>;
}
