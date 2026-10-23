import React from 'react';
import { ExpandIcon, HandIcon, PointerIcon } from 'lucide-react';

/** Consistent icon-above-copy treatment for gesture teaching surfaces. */
export function GestureInstructions({ steps }: { steps: { gesture: 'pinch' | 'tap'; text: string }[] }) {
  return <ul className="m-0 grid list-none gap-6 p-0 text-center">
    {steps.map(step => <li key={step.gesture} className="grid justify-items-center gap-2">
      <span aria-hidden="true" className="relative flex h-12 w-12 items-center justify-center text-[var(--text-primary)]">
        {step.gesture === 'pinch' ? <><HandIcon size={32} strokeWidth={1.5} /><ExpandIcon size={18} strokeWidth={1.5} className="absolute -right-1 -top-1" /></> : <PointerIcon size={32} strokeWidth={1.5} />}
      </span>
      <p className="m-0 min-w-0">{step.text}</p>
    </li>)}
  </ul>;
}
