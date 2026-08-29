import { useEffect, useRef, useState } from 'react';

/**
 * Measures an element's content box.
 *
 * Charts that must fill the space they are given need their real pixel box, so
 * an SVG can use a 1:1 viewBox and scale without distorting strokes or points.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0
  });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const {
        width,
        height
      } = entry.contentRect;
      setSize((current) => current.width === width && current.height === height ? current : {
        width,
        height
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return {
    ref,
    ...size
  };
}