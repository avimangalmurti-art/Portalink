import React from 'react';
import { ArrowLeftIcon } from 'lucide-react';

/** Explicit return control without intercepting profile scrolling or touches. */
export function MobileProfileBack({ onBack }: { onBack: () => void }) {
  return <button type="button" data-mobile-profile-back="" aria-label="Back" onClick={onBack}><ArrowLeftIcon size={24} aria-hidden="true" /></button>;
}
