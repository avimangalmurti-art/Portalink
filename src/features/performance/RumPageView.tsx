import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { beginRumPageView } from './rum';

/** Auth/query/hash changes within the same screen do not create extra beacons. */
export function RumPageView() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { beginRumPageView(pathname); }, [pathname]);
  return null;
}
