import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const shareModel = sourceModule('src/features/sharing/shareModel.ts');

// Execute the real component and dismissal helpers. Only browser/service edges
// and React's hook scheduler are simulated; no accounts or clipboard are used.
function fixture({ handle = 'mira', copyError, markGate, markError, storage = new Map() } = {}) {
  const calls = [], slots = [], effects = [];
  let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        const slot = slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  const window = {
    location: { origin: 'https://portfolio.example' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    addEventListener() {}, removeEventListener() {},
  };
  const first = sourceModule('src/features/publishing/firstProject.ts', {}, { window });
  first.rememberLivePortfolio('creator', 'project');
  const profiles = {
    getPortfolioCard: async () => null,
    getShareAddress: async () => ({ handle }),
    markHandleShared: async (profileId, value) => {
      calls.push(['mark', profileId, value]);
      if (markGate) await markGate;
      if (markError) throw markError;
    },
  };
  const { PortfolioLiveCard } = sourceModule('src/features/publishing/PortfolioLiveCard.tsx', {
    '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    react,
    '../../contexts/ServicesContext': { useServices: () => ({ profiles }) },
    '../sharing/PortfolioPreview': { PortfolioPreview: () => null },
    '../sharing/shareModel': shareModel,
    '../sharing/sharing.css': {},
    '../../utils/copyPublicLink': { copyPublicLink: async url => {
      calls.push(['copy', url]);
      if (copyError) throw copyError;
    } },
    '../../components/media/ProjectCover': { ProjectCover: () => null },
    '../../components/ui/Button': { Button: 'button' },
    './firstProject': { ...first, dismissLivePortfolio(profileId) {
      calls.push(['dismiss', profileId]);
      first.dismissLivePortfolio(profileId);
    } },
  }, { React: react, window, DOMException, navigator: { share: async value => calls.push(['native', value.url]) } });
  const props = {
    profile: { id: 'creator', name: 'Mira', headline: '', isPrivate: false,
      projects: [{ id: 'project', title: 'Quiet Rooms', cover: '/cover.webp', isPubliclyVisible: true }] },
    publishedProjectId: 'project',
    onBeforeShare: async () => { calls.push(['before']); },
    onOpenShare: () => calls.push(['dialog']),
  };
  const render = () => {
    cursor = 0;
    const tree = PortfolioLiveCard(props);
    while (effects.length) effects.shift()();
    return tree;
  };
  return { calls, storage, first, render, unmount() { slots.forEach(slot => slot.cleanup?.()); },
    async ready() { render(); await tick(); return render(); },
  };
}

function elements(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
}
const text = node => React.isValidElement(node)
  ? React.Children.toArray(node.props.children).map(text).join('') : String(node ?? '');
function button(tree, label) {
  const found = elements(tree).find(node => node.type === 'button' && text(node) === label);
  assert.ok(found, `Expected ${label} button`);
  return found;
}

test('Copy link copies the actual handle URL even when the share-dialog callback exists', async () => {
  const h = fixture();
  button(await h.ready(), 'Copy link').props.onClick();
  await tick();
  assert.deepEqual(h.calls, [['before'], ['mark', 'creator', 'mira'], ['copy', 'https://portalinknetworks.com/mira'], ['dismiss', 'creator']]);
  assert.equal(h.render(), null);
  h.unmount();
});

test('Send to someone opens the share dialog without copying, invoking native share, or prematurely dismissing', async () => {
  const h = fixture();
  button(await h.ready(), 'Send to someone').props.onClick();
  await tick();
  assert.deepEqual(h.calls, [['dialog']]);
  assert.ok(h.render());
  assert.equal(h.first.livePortfolioDismissed('creator'), false);
  h.unmount();
});

test('successful copy dismisses once and the live card remains dismissed after remount', async () => {
  const h = fixture({ handle: null });
  button(await h.ready(), 'Copy link').props.onClick();
  await tick();
  assert.deepEqual(h.calls, [['before'], ['copy', 'https://portalinknetworks.com/share/creator'], ['dismiss', 'creator']]);
  assert.equal(h.first.livePortfolioDismissed('creator'), true);
  assert.equal(h.render(), null);
  h.unmount();
  const remounted = fixture({ storage: h.storage });
  assert.equal(await remounted.ready(), null);
  assert.deepEqual(remounted.calls, []);
  remounted.unmount();
});

test('copy failure leaves the card and its retry available without dismissing', async () => {
  const h = fixture({ copyError: new Error('Clipboard unavailable') });
  button(await h.ready(), 'Copy link').props.onClick();
  await tick();
  const tree = h.render();
  assert.deepEqual(h.calls, [['before'], ['mark', 'creator', 'mira'], ['copy', 'https://portalinknetworks.com/mira']]);
  assert.equal(h.first.livePortfolioDismissed('creator'), false);
  assert.equal(button(tree, 'Copy link').props.disabled, false);
  assert.equal(text(elements(tree).find(node => node.props.role === 'alert')), 'Could not share the link. Please try again.');
  h.unmount();
});

test('handle sharing must finish before a URL is copied and the card is dismissed', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = fixture({ markGate: gate });
  button(await h.ready(), 'Copy link').props.onClick();
  await tick();
  assert.deepEqual(h.calls, [['before'], ['mark', 'creator', 'mira']]);
  assert.equal(button(h.render(), 'Copy link').props.disabled, true);
  assert.equal(h.first.livePortfolioDismissed('creator'), false);
  release();
  await tick();
  assert.deepEqual(h.calls.slice(2), [['copy', 'https://portalinknetworks.com/mira'], ['dismiss', 'creator']]);
  assert.equal(h.render(), null);
  h.unmount();
});

test('a failed handle reservation prevents copying or dismissal', async () => {
  const h = fixture({ markError: new Error('Handle changed') });
  button(await h.ready(), 'Copy link').props.onClick();
  await tick();
  assert.deepEqual(h.calls, [['before'], ['mark', 'creator', 'mira']]);
  assert.equal(h.first.livePortfolioDismissed('creator'), false);
  assert.ok(elements(h.render()).find(node => node.props.role === 'alert'));
  h.unmount();
});
