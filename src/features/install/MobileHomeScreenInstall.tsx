import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { mobileInstallStore } from './installState';
import { useMobileInstallState } from './useMobileInstall';

export function MobileHomeScreenInstall() {
  const install = useMobileInstallState();
  const [expanded, setExpanded] = useState(false);
  const instructionsId = useId(), trigger = useRef<HTMLButtonElement>(null);
  if (install.standalone) return null;
  const ios = install.platform === 'ios-safari' || install.platform === 'ios-other';
  const message = install.status === 'accepted' ? 'Follow the browser’s instructions to finish adding Portalink.'
    : install.status === 'dismissed' ? 'Installation cancelled. You can add Portalink later from your browser menu.'
    : install.status === 'failed' ? 'The installation prompt could not open. Use your browser menu to add Portalink.' : null;
  return <>
    <Button ref={trigger} variant="secondary" aria-expanded={expanded} aria-controls={expanded ? instructionsId : undefined} onClick={() => setExpanded(value => !value)}><span className="settings-action-label">Add to Home Screen</span></Button>
    {expanded && <div id={instructionsId} className="w-full space-y-3">
      <p>Open Portalink from your Home Screen in its own app window.</p>
      {(install.canPrompt || install.status === 'prompting') && <Button variant="secondary" isLoading={install.status === 'prompting'} onClick={mobileInstallStore.requestInstall}><span className="settings-action-label">Install Portalink</span></Button>}
      {ios ? <ol className="list-decimal space-y-2 pl-5" aria-label="Home Screen installation instructions">
        {install.platform === 'ios-other' && <li>Open portalinknetworks.com in Safari.</li>}
        <li>Tap Share in Safari.</li>
        <li>Choose Add to Home Screen.</li>
        <li>Leave Open as Web App on if shown, then tap Add.</li>
      </ol> : install.platform === 'android' ? <ol className="list-decimal space-y-2 pl-5" aria-label="Home Screen installation instructions">
        <li>Open your browser menu.</li>
        <li>Choose Install app or Add to Home screen if available.</li>
        <li>Follow the instructions, then open Portalink from your Home Screen.</li>
      </ol> : <p>Look for Install app or Add to Home Screen in your browser menu. If it is unavailable, open Portalink in Safari on iPhone or Chrome on Android.</p>}
      {message && <p role="status">{message}</p>}
      <Button variant="ghost" onClick={() => { setExpanded(false); trigger.current?.focus({ preventScroll: true }); }}>Done</Button>
    </div>}
  </>;
}
