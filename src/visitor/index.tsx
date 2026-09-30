import '../index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ServicesProvider } from '../contexts/ServicesContext';
import { AuthProvider } from '../contexts/AuthContext';
import { ProfileDataProvider } from '../contexts/ProfileDataContext';
import { EngagementProvider } from '../contexts/EngagementContext';
import { AppPresentationProvider } from '../presentation/AppPresentation';
import { visitorServices } from '../services/visitorServices';
import { VisitorApp } from './VisitorApp';

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<BrowserRouter><ServicesProvider services={visitorServices}>
  <AuthProvider><ProfileDataProvider><EngagementProvider><AppPresentationProvider>
    <VisitorApp />
  </AppPresentationProvider></EngagementProvider></ProfileDataProvider></AuthProvider>
</ServicesProvider></BrowserRouter>);
