import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './entryAgreements.css';

const agreements = ['A. Terms of Service', 'B. Privacy Policy', 'C. Content Licence', 'D. AI Access Terms'];
type Controls = { request: () => Promise<boolean>; show: () => void };
const Context = createContext<Controls>({ request: async () => false, show: () => undefined });
// eslint-disable-next-line react-refresh/only-export-components -- This consumer belongs to the same agreement provider boundary.
export const useEntryAgreements = () => useContext(Context);

/** Temporary, in-memory flow acknowledgement. Not a receipt for reviewed legal documents. */
export function EntryAgreements({ onDisagree, children }: { onDisagree: () => void; children: (controls: Controls) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(false); }, []);
  const controls: Controls = {
    show: () => setOpen(true),
    request: () => {
      if (accepted) return Promise.resolve(true);
      if (resolve.current) return Promise.resolve(false);
      setOpen(true);
      return new Promise<boolean>(complete => { resolve.current = complete; });
    },
  };
  function finish(agree: boolean) {
    setOpen(false); setAccepted(agree);
    resolve.current?.(agree); resolve.current = null;
    if (!agree) onDisagree();
  }
  return <Context.Provider value={controls}>
    <div ref={element => { if (element) element.inert = open; }} aria-hidden={open || undefined}>{children(controls)}</div>
    {open && <AgreementSheet onAgree={() => finish(true)} onDisagree={() => finish(false)} />}
  </Context.Provider>;
}

export function EntryLegal() {
  const { show } = useEntryAgreements();
  return <p className="entry-legal">Before creating an account, read our <button type="button" onClick={show}>Terms</button> and <button type="button" onClick={show}>Privacy</button>.</p>;
}

function AgreementSheet({ onAgree, onDisagree }: { onAgree: () => void; onDisagree: () => void }) {
  const dialog = useRef<HTMLElement>(null), viewport = useDialogViewport();
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useModalFocus(true, dialog, onDisagree, true);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; heading.current?.focus({ preventScroll:true }); }, [selected]);
  return <ModalPortal><div ref={viewport} className="entry-agreements-overlay" style={{ top:'var(--dialog-viewport-top, 0px)', height:'var(--dialog-viewport-height, 100dvh)' }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="entry-agreement-title" tabIndex={-1} className="entry-agreements-sheet">
      <header>{selected !== null && <button type="button" onClick={() => setSelected(null)}>‹ Terms and Conditions</button>}
        <h1 id="entry-agreement-title" ref={heading} tabIndex={-1}>{selected === null ? 'Terms and Conditions' : agreements[selected]}</h1>
      </header>
      <div ref={scroller} className="entry-agreements-scroll">
        <div className="entry-agreements-card"><strong>IMPORTANT</strong><p>Placeholder legal copy — review required before release. These four agreements are awaiting approved legal text.</p>
          {selected === null && <nav aria-label="Agreements">{agreements.map((title, index) => <button type="button" key={title} onClick={() => setSelected(index)}>{title}<span aria-hidden="true">›</span></button>)}</nav>}
        </div>
        <div className="entry-agreements-card"><h2>{selected === null ? 'Agreements overview' : agreements[selected]}</h2>
          <p>[Placeholder: insert the approved {selected === null ? 'agreements summary' : agreements[selected].slice(3)} here.]</p>
          <p>Legal review required. No final licence, privacy promise, AI permission, or account-deletion policy is established by this placeholder.</p>
        </div>
      </div>
      <footer><button type="button" className="entry-agree" onClick={onAgree}>Agree</button><button type="button" onClick={onDisagree}>Disagree</button></footer>
    </section>
  </div></ModalPortal>;
}
