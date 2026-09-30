import React from 'react';
import { ArrowLeftIcon, HandshakeIcon } from 'lucide-react';
import type { Profile } from '../../types/domain';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { InterfaceIcon } from '../ui/InterfaceIcon';

/** A separate destination; collaboration services are not implemented yet. */
export function CollaborationPage({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  return <section aria-labelledby="collaboration-title" className="mx-auto w-full max-w-[680px] px-5 pb-10 pt-3 text-[var(--text-primary)]">
    <header className="flex min-h-14 items-center gap-3 border-b border-[var(--hairline)] pb-3">
      <ScreenBack action={onBack} visibleOnMobile><button type="button" onClick={onBack}
        aria-label="Back to profile" title="Back to profile"
        className="ps-btn ps-btn-secondary flex min-h-11 min-w-11 shrink-0 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
        <InterfaceIcon icon={ArrowLeftIcon} size="sm" mirroredInRtl />
      </button></ScreenBack>
      <div className="min-w-0">
        <h1 id="collaboration-title" className="text-[20px] font-semibold tracking-[-0.015em]">Collaboration</h1>
        <p className="break-words text-[13px] text-[var(--text-secondary)]">{profile.name}</p>
      </div>
    </header>
    <div className="mx-auto flex max-w-[320px] flex-col items-center px-2 py-16 text-center">
      <span aria-hidden="true" className="text-[var(--icon-secondary)]"><HandshakeIcon size={32} strokeWidth={1.5} /></span>
      <h2 className="mt-5 text-[18px] font-semibold">A space to work together</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)]">Collaboration tools aren’t available yet.</p>
    </div>
  </section>;
}
