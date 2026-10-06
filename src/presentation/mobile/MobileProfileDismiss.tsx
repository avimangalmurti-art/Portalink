import React, { useRef } from 'react';

/** A visible, touch-safe dismissal handle; tapping is the accessible alternative. */
export function MobileProfileDismiss({ onDismiss }: { onDismiss: () => void }) {
  const gesture = useRef<{ id: number; x: number; y: number; distance: number; page: HTMLElement | null } | null>(null);
  const suppressClick = useRef(false);
  const reset = () => {
    const current = gesture.current;
    if (current?.page) current.page.style.removeProperty('transform');
    gesture.current = null;
  };
  return <button type="button" className="mobile-profile-dismiss" aria-label="Return to previous screen" onClick={() => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onDismiss();
  }} onPointerDown={event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0, page: event.currentTarget.closest('[data-profile-page]') };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (Math.abs(event.clientX - current.x) > 60) { suppressClick.current = true; reset(); return; }
    current.distance = Math.max(0, event.clientY - current.y);
    if (current.distance > 8) suppressClick.current = true;
    if (current.page) current.page.style.transform = `translateY(${Math.min(current.distance, 220)}px)`;
  }} onPointerUp={event => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dismiss = current.distance >= 80;
    reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dismiss) onDismiss();
  }} onPointerCancel={() => { suppressClick.current = true; reset(); }} onLostPointerCapture={reset}><span aria-hidden="true" /></button>;
}
