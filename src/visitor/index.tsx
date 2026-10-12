import '../index.css';
import './mobile/public-mobile.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ServicesProvider } from '../contexts/ServicesContext';
import { AuthProvider } from '../contexts/AuthContext';
import { TermsProvider } from '../features/legal/TermsContext';
import { ProfileDataProvider } from '../contexts/ProfileDataContext';
import { EngagementProvider } from '../contexts/EngagementContext';
import { AppPresentationProvider } from '../presentation/AppPresentation';
import { visitorServices } from '../services/visitorServices';
import { VisitorApp } from './VisitorApp';
import { initializeRum } from '../features/performance/rum';
import { RumPageView } from '../features/performance/RumPageView';

initializeRum(__APP_VERSION__, import.meta.env.VITE_RUNTIME_MODE !== 'prototype' && import.meta.env.PROD);

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<BrowserRouter><RumPageView /><ServicesProvider services={visitorServices}>
  <AuthProvider><TermsProvider><ProfileDataProvider><EngagementProvider><AppPresentationProvider>
    <VisitorApp />
  </AppPresentationProvider></EngagementProvider></ProfileDataProvider></TermsProvider></AuthProvider>
</ServicesProvider></BrowserRouter>);
