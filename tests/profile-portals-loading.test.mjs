import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { sourceModule } from './helpers/source-module.mjs';

test('a delayed portal chunk stays inside its cancellable surface instead of replacing the profile', () => {
  const { DeferredSurface } = sourceModule('src/components/ui/DeferredDialog.tsx', {
    './DeferredSurfaceOwner': { DeferredSurfaceOwnerContext: React.createContext({}) },
    react: React,
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    './ModalPortal': { ModalPortal: ({ children }) => children },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
  });
  const PendingPortals = React.lazy(() => new Promise(() => {}));
  const html = renderToString(React.createElement(React.Suspense, { fallback: 'Whole profile loading' },
    React.createElement('section', null,
      React.createElement('h1', null, 'Creator profile'),
      React.createElement('input', { defaultValue: 'Preserved profile state' }),
      React.createElement(DeferredSurface, { active: true, onClose() {} }, React.createElement(PendingPortals)))));
  assert.match(html, /Creator profile/);
  assert.match(html, /Preserved profile state/);
  assert.match(html, /Opening/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /Whole profile loading/);
});
