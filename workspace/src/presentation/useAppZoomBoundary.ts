import { useEffect } from 'react';

/** Keep gestures inside the app's content instead of scaling the browser viewport. */
export function useAppZoomBoundary() {
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.cancelable) event.preventDefault();
    };
    const touch = (event: TouchEvent) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault();
    };
    const gesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    // Cancel defaults before popovers can stop bubbling. Never stop propagation:
    // viewers, crops and maps retain their own zoom, even at their scale limits.
    // Document scope also includes menus/dialogs portalled outside the app host.
    document.addEventListener('wheel', wheel, { capture: true, passive: false });
    document.addEventListener('touchmove', touch, { capture: true, passive: false });
    document.addEventListener('gesturestart', gesture, { capture: true, passive: false });
    document.addEventListener('gesturechange', gesture, { capture: true, passive: false });
    return () => {
      document.removeEventListener('wheel', wheel, true);
      document.removeEventListener('touchmove', touch, true);
      document.removeEventListener('gesturestart', gesture, true);
      document.removeEventListener('gesturechange', gesture, true);
    };
  }, []);
}
