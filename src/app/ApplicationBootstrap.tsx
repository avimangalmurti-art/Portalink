import React, { useEffect, useState } from 'react';
import { App } from '../App';
import { PortalinkSplashLoader } from '../components/ui/PortalinkSplashLoader';
import { useAuth } from '../contexts/AuthContext';

/**
 * Session restoration is the application's real startup readiness boundary.
 * A full page load holds the splash for one second, then it leaves as soon as
 * that minimum and the existing readiness state have both settled.
 */
export function ApplicationBootstrap() {
  const auth = useAuth();
  const [hasMinimumSplashTimeElapsed, setHasMinimumSplashTimeElapsed] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasMinimumSplashTimeElapsed(true);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return auth.isInitializing || !hasMinimumSplashTimeElapsed ? <PortalinkSplashLoader /> : <App />;
}
