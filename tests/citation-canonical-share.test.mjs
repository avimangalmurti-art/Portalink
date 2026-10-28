import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const model = sourceModule('src/features/citations/model.ts');
const publicOrigin = sourceModule('src/features/citations/publicOrigin.ts');
const item = { id: 'source/page-30', creatorId: 'creator', projectId: 'project', creator: 'A. Creator', projectTitle: 'Existing work', kind: 'image', number: 30, madeOn: '2026-10-06' };
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];

function citationEntry(href, nativeShare) {
  const slots = [], shared = [], copied = [], reads = [];
  let cursor = 0, dirty = true, effects = [], component, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    ...React,
    lazy: () => 'lazy-content',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!same(previous?.deps, deps)) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  sourceModule('src/citation/index.tsx', {
    react,
    'react-dom/client': { createRoot: () => ({ render: element => { component = element.type; } }) },
    '../presentation/motion/imageDimensions': { imageDimensions: async () => null },
    '../presentation/motion/ImageMotion': { ImageMotion: 'image-motion' },
    '../components/ui/StateViews': { LoadingSkeleton: 'loading' },
    '../features/citations/publicOrigin': publicOrigin,
    './publicRead': {
      readPublicCitation: async id => { reads.push(id); return item; },
      readCitationAppearance: async () => null,
      readCitedIn: async () => [],
    },
    '../features/citations/model': model,
    './CitationCards': { CitationCards: 'citation-cards' },
    '../components/ui/RouteError': { RouteError: 'route-error', routeErrorKind: () => 'network' },
    '../features/citations/citations.css': {},
    './citation-entry.css': {},
  }, {
    location: new URL(href), window: {}, DOMException,
    document: { getElementById: () => ({}), documentElement: { style: {} } },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    sessionStorage: { getItem: () => null, removeItem() {} },
    navigator: {
      ...(nativeShare ? { share: async value => { shared.push(value); } } : {}),
      clipboard: { writeText: async value => { copied.push(value); } },
    },
  });
  const render = () => {
    for (let pass = 0; dirty; pass++) {
      assert.ok(pass < 12, 'Citation entry state must settle');
      dirty = false; cursor = 0; effects = [];
      tree = component(); effects.forEach(effect => effect());
    }
    return nodes(tree).find(node => node.type === 'citation-cards');
  };
  const flush = async () => { for (let pass = 0; pass < 20; pass++) { render(); await Promise.resolve(); } return render(); };
  return { shared, copied, reads, flush, dispose: () => slots.forEach(slot => slot.cleanup?.()) };
}

for (const nativeShare of [true, false]) {
  test(`citation ${nativeShare ? 'native sharing' : 'clipboard sharing'} uses the stable official source link without callback state`, async () => {
    for (const origin of ['https://portalinknetworksinc.avimangalmurti566055.chatgpt.site', 'http://127.0.0.1:5173', 'https://portalinknetworks.com']) {
      const h = citationEntry(`${origin}/cite/source%2Fpage-30?cite=1&entry=oauth&code=secret&via=friend8#access_token=secret`, nativeShare);
      try {
        const card = await h.flush();
        assert.deepEqual(h.reads, [item.id]);
        assert.equal(card.props.item, item);
        card.props.onShare();
        const after = await h.flush();
        const expected = 'https://portalinknetworks.com/cite/source%2Fpage-30';
        if (nativeShare) {
          assert.equal(h.shared.length, 1);
          assert.equal(h.shared[0].url, expected);
          assert.equal(h.shared[0].title, item.projectTitle);
          assert.deepEqual(h.copied, []);
        } else {
          assert.deepEqual(h.shared, []);
          assert.deepEqual(h.copied, [expected]);
          assert.equal(after.props.status, 'Link copied.');
        }
      } finally { h.dispose(); }
    }
  });
}
