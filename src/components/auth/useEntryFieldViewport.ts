import { useEffect, type RefObject } from 'react';

/** Keep the mobile account form still while editing; reveal only an obscured field. */
export function useEntryFieldViewport(ref: RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const viewport = window.visualViewport;
    const editable = 'input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select';
    let frame = 0;
    let blurTimer = 0;
    let editing = false;
    let manualControl = false;
    let restingHeight = viewport?.height ?? window.innerHeight;
    let layoutWidth = window.innerWidth;
    const activeField = () => {
      const field = document.activeElement;
      return field instanceof HTMLElement && root.contains(field) && field.matches(editable)
        && field.closest('.entry-inline-form') ? field : null;
    };
    const cancelReveal = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const releaseIfIdle = () => {
      const height = viewport?.height ?? window.innerHeight;
      if (activeField() || height < restingHeight - 2) return;
      editing = false;
      manualControl = false;
      restingHeight = height;
      root.removeAttribute('data-entry-editing');
      root.style.removeProperty('--entry-editing-inset');
    };
    const reveal = () => {
      cancelReveal();
      if (manualControl) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const field = activeField();
        if (!field || manualControl) return;
        const bounds = root.getBoundingClientRect();
        const rect = field.getBoundingClientRect();
        const top = Math.max(bounds.top, viewport?.offsetTop ?? 0) + 16;
        const bottom = Math.min(bounds.bottom, (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - 16;
        if (bottom <= top) return;
        const label = Array.from(root.querySelectorAll<HTMLLabelElement>('label'))
          .find(item => item.htmlFor === field.id);
        const labelTop = label?.getBoundingClientRect().top ?? rect.top;
        const targetTop = Math.min(rect.top, labelTop);
        // Include its label when it fits; the editable area takes priority at large text sizes.
        const start = rect.bottom - targetTop <= bottom - top ? targetTop : rect.top;
        const delta = start < top ? start - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
        if (delta) root.scrollTop += delta;
      });
    };
    const onFocus = () => {
      if (!activeField()) return;
      window.clearTimeout(blurTimer);
      manualControl = false;
      if (!editing) {
        const actions = root.querySelector<HTMLElement>('.mobile-share-landing-actions');
        if (!actions) return;
        const inset = Math.max(0, actions.getBoundingClientRect().top - root.getBoundingClientRect().top
          + root.scrollTop - (parseFloat(getComputedStyle(root).paddingTop) || 0));
        root.style.setProperty('--entry-editing-inset', `${inset}px`);
        root.setAttribute('data-entry-editing', 'true');
        editing = true;
      }
      reveal();
    };
    const onBlur = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!activeField()) cancelReveal();
        releaseIfIdle();
      }, 0);
    };
    const onResize = () => {
      if (window.innerWidth !== layoutWidth) {
        layoutWidth = window.innerWidth;
        restingHeight = window.innerHeight;
      }
      if (!editing) restingHeight = viewport?.height ?? window.innerHeight;
      releaseIfIdle();
      if (editing) reveal();
    };
    // A caret tap, selection drag or manual scroll owns the viewport until another field is selected.
    const takeControl = () => { manualControl = true; cancelReveal(); };
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onBlur);
    root.addEventListener('pointerdown', takeControl, { passive: true });
    root.addEventListener('touchmove', takeControl, { passive: true });
    root.addEventListener('wheel', takeControl, { passive: true });
    viewport?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    onFocus();
    return () => {
      cancelReveal();
      window.clearTimeout(blurTimer);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('focusout', onBlur);
      root.removeEventListener('pointerdown', takeControl);
      root.removeEventListener('touchmove', takeControl);
      root.removeEventListener('wheel', takeControl);
      viewport?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
      root.removeAttribute('data-entry-editing');
      root.style.removeProperty('--entry-editing-inset');
    };
  }, [ref, enabled]);
}
