import "./index.css";
import './components/profile/icon-create-mobile.css';
import './presentation/mobile/mobile.css';
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ServicesProvider } from "./contexts/ServicesContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProfileDataProvider } from "./contexts/ProfileDataContext";
import { EngagementProvider } from "./contexts/EngagementContext";
import { ApplicationBootstrap } from "./app/ApplicationBootstrap";
import { services } from "./services";
import { initializeRum } from './features/performance/rum';
import { RumPageView } from './features/performance/RumPageView';
import { waitForStartupStyles } from './app/startupStyles';

initializeRum(__APP_VERSION__, import.meta.env.VITE_RUNTIME_MODE !== 'prototype' && import.meta.env.PROD);

const rootEl = document.getElementById("root");
if (rootEl) {
  // Services resolve first: the auth provider reads `AuthService` from them.
  // Profile records are read through their own boundary, so one invalidation
  // after a write updates every surface at once.
  // The browser URL is the canonical navigation state, so the router wraps
  // everything: the shell derives its destination from the location rather than
  // maintaining a second navigation state machine.
  document.documentElement.dataset.portalinkEntryReady = 'true';
  window.dispatchEvent(new Event('portalink:main-entry-ready'));
  void waitForStartupStyles().then(() => {
    // Public entries skip the intro. Ordinary startup adopts this same video
    // inside its layout effect, after the application has actually mounted.
    if (document.documentElement.hasAttribute('data-shared-view')) document.getElementById('portalink-preboot')?.remove();
    ReactDOM.createRoot(rootEl).render(<BrowserRouter useTransitions={false}>
      <RumPageView />
      <ServicesProvider services={services}>
        <AuthProvider>
          <ProfileDataProvider>
            {/* Engagement is one record per project for the whole app, so a like
               in the viewer is the same fact as the one on its feed card. */}
            <EngagementProvider>
              <ApplicationBootstrap />
            </EngagementProvider>
          </ProfileDataProvider>
        </AuthProvider>
      </ServicesProvider>
    </BrowserRouter>);
  });
}
