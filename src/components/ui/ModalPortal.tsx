import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Mount modal backdrops at the application root so a dialog opened from an
 * animated screen or sidebar cannot be clipped to that panel's containing
 * block. The modal stays inside the themed application tree and therefore
 * keeps the active interface tokens.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  const target = document.querySelector<HTMLElement>('.app-shell');
  return target ? createPortal(children, target) : null;
}
