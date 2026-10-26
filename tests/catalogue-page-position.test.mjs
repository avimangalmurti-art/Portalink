import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const state = () => sourceModule('src/features/profile/cataloguePagePosition.ts');

test('inline positions start on cover, belong to stable project IDs and survive remount without shared mutation', () => {
  const memory = state();
  assert.equal(memory.getCataloguePagePosition('first'), undefined);
  assert.equal(memory.resolveCataloguePageIndex(['cover', 'a']), 0);
  memory.rememberCataloguePagePosition('first', { index: 2, key: 'image:b', attachmentId: 'b' });
  memory.rememberCataloguePagePosition('second', { index: 1, key: 'pdf:c:4', attachmentId: 'c', page: 4 });
  const first = memory.getCataloguePagePosition('first');
  assert.equal(first.index, 2); assert.equal(first.attachmentId, 'b'); assert.equal(first.page, undefined);
  first.index = 0;
  assert.equal(memory.getCataloguePagePosition('first').index, 2);
  assert.equal(memory.getCataloguePagePosition('second').page, 4);
  assert.equal(state().getCataloguePagePosition('first'), undefined, 'A new browsing document starts fresh; no backend or browser storage is needed.');
});

test('stable slide identity wins over an old ordinal and changed content clamps without losing loading memory', () => {
  const memory = state();
  memory.rememberCataloguePagePosition('work', { index: 3, key: 'page:kept', attachmentId: 'pdf', page: 3 });
  const position = memory.getCataloguePagePosition('work');
  assert.equal(memory.resolveCataloguePageIndex(['cover', 'page:kept', 'page:new'], position), 1);
  assert.equal(memory.resolveCataloguePageIndex(['cover', 'page:new'], position), 1);
  assert.equal(memory.resolveCataloguePageIndex(['cover'], position), 0);
  assert.equal(memory.resolveCataloguePageIndex([], position), 0);
  assert.equal(memory.getCataloguePagePosition('work').key, 'page:kept', 'A temporary incomplete slide list cannot overwrite the remembered identity.');
  assert.equal(memory.resolveCataloguePageIndex(['cover', 'one', 'two', 'page:kept'], memory.getCataloguePagePosition('work')), 3);
});

test('session positions normalize invalid ordinals while preserving only valid reader hints', () => {
  const memory = state();
  memory.rememberCataloguePagePosition('work', { index: -4.5, key: 'cover', page: 0 });
  assert.equal(memory.getCataloguePagePosition('work').index, 0);
  assert.equal(memory.getCataloguePagePosition('work').page, undefined);
  memory.rememberCataloguePagePosition('work', { index: Infinity, key: 'image' });
  assert.equal(memory.getCataloguePagePosition('work').index, 0);
  assert.equal(memory.resolveCataloguePageIndex(['cover', 'image'], { index: NaN, key: 'removed' }), 0);
  memory.rememberCataloguePagePosition('', { index: 1, key: 'image' });
  memory.rememberCataloguePagePosition('invalid', { index: 1, key: '' });
  assert.equal(memory.getCataloguePagePosition(''), undefined); assert.equal(memory.getCataloguePagePosition('invalid'), undefined);
});

function geometry({ contained = false, hidden = false, mobile = false, header = null, cards = [{ id: 'above', top: -180, height: 100 }, { id: 'visible', top: -60, height: 300 }, { id: 'next', top: 244, height: 200 }] } = {}) {
  const listeners = new Map(), frames = new Map(); let frameId = 0, documentScroll = 0, ownerScroll = 0;
  const root = {}, body = { parentElement: root };
  const owner = { parentElement: body, scrollHeight: 2400, clientHeight: 400, clientTop: 2, isConnected: true,
    getBoundingClientRect: () => ({ top: 100, bottom: 504, left: 0, right: 420, width: 420, height: 404 }),
    scrollBy({ top }) { ownerScroll += top; },
  };
  const headerNode = header ? { isConnected: true,
    closest: () => header.hidden ? {} : null,
    getBoundingClientRect: () => ({ top: header.top ?? 0, bottom: header.bottom, left: header.left ?? 0, right: header.right ?? 420,
      width: (header.right ?? 420) - (header.left ?? 0), height: header.bottom - (header.top ?? 0) }),
  } : null;
  const profile = headerNode ? { querySelector: selector => selector === ':scope > .profile-header-region' ? headerNode : null } : null;
  const presentation = mobile ? {} : null;
  const elements = cards.map(card => ({ dataset: { projectContinuityId: card.id }, isConnected: true,
    closest: () => card.hidden ? {} : null,
    getBoundingClientRect: () => { const top = card.top - (contained ? ownerScroll : documentScroll); return { top, bottom: top + card.height, left: 0, right: 420, width: 420, height: card.height }; },
  }));
  const surface = { parentElement: contained ? owner : body, isConnected: true,
    closest: selector => selector === '[data-presentation="mobile"]' ? presentation : selector === '[data-profile-page]' ? profile : hidden ? {} : null,
    getBoundingClientRect: () => ({ top: 0, bottom: 600, left: 0, right: 420, width: hidden ? 0 : 420, height: 600 }),
    querySelectorAll: () => elements,
  };
  const window = { innerHeight: 600, scrollBy({ top }) { documentScroll += top; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const module = sourceModule('src/components/profile/ProjectPageBrowsingContext.tsx', { react: React }, {
    window, document: { body, documentElement: root },
    getComputedStyle: element => ({ overflowY: element === owner ? 'auto' : 'visible', position: element === headerNode ? header.position ?? 'sticky' : 'static', top: '0px' }),
    requestAnimationFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return { ...module, surface, cards, elements, listeners, frames, owner,
    get documentScroll() { return documentScroll; }, get ownerScroll() { return ownerScroll; },
    flush() { let passes = 0; while (frames.size) { assert.ok(passes++ < 40, 'Density correction must stay bounded'); const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); } },
  };
}

test('density snapshot keeps the nearest visible project and offset on the document scroller', () => {
  const h = geometry(), anchor = h.captureCatalogueDensityAnchor(h.surface);
  assert.equal(anchor.projectId, 'visible'); assert.equal(anchor.offset, -60); assert.equal(anchor.scroller, null);
  h.cards[1].top = 220;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.documentScroll, 280); assert.equal(h.ownerScroll, 0);
  assert.equal(h.elements[1].getBoundingClientRect().top, -60);
  assert.equal(h.listeners.size, 0); assert.equal(h.frames.size, 0);
});

test('density snapshot uses a contained web scroller and its inner top edge', () => {
  const h = geometry({ contained: true, cards: [{ id: 'work', top: 120, height: 300 }] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  assert.equal(anchor.projectId, 'work'); assert.equal(anchor.offset, 18); assert.equal(anchor.scroller, h.owner);
  h.cards[0].top = 280;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.ownerScroll, 160); assert.equal(h.documentScroll, 0);
  assert.equal(h.elements[0].getBoundingClientRect().top, 120);
});

test('density snapshots and restoration ignore hidden adjacent slides with the same project ID', () => {
  const h = geometry({ cards: [{ id: 'work', top: -80, height: 300, hidden: true }, { id: 'work', top: -40, height: 300 }] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  assert.equal(anchor.projectId, 'work'); assert.equal(anchor.offset, -40);
  h.cards[0].top = 900; h.cards[1].top = 220;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.documentScroll, 260);
  assert.equal(h.elements[1].getBoundingClientRect().top, -40, 'Only the settled accessible slide owns restoration.');
  const allHidden = geometry({ cards: [{ id: 'hidden', top: 20, height: 300, hidden: true }] });
  assert.equal(allHidden.captureCatalogueDensityAnchor(allHidden.surface), null);
});

test('when a tall project shrinks, density restoration keeps a usable part of its cover visible', () => {
  const h = geometry({ cards: [{ id: 'work', top: -400, height: 600 }] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  h.cards[0].top = 20; h.cards[0].height = 100;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.elements[0].getBoundingClientRect().bottom, 44);
});

test('mobile density snapshots skip projects completely covered by the pinned profile header', () => {
  const h = geometry({ mobile: true, header: { bottom: 249 }, cards: [
    { id: 'occluded', top: 49, height: 100 }, { id: 'visible', top: 260, height: 100 },
  ] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  assert.equal(anchor.projectId, 'visible', 'A card behind the social-links header cannot own the visible reading position.');
  assert.equal(anchor.offset, 11);
  h.cards[1].top = 430;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.elements[1].getBoundingClientRect().top, 260);
});

test('mobile tall-to-short density restoration retains 44 usable pixels below the pinned header', () => {
  const h = geometry({ mobile: true, header: { bottom: 249 }, cards: [{ id: 'work', top: -60, height: 500 }] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  assert.equal(anchor.offset, -309);
  h.cards[0].top = 400; h.cards[0].height = 100;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.elements[0].getBoundingClientRect().bottom, 249 + 44);
});

test('mobile density restoration measures the current responsive profile-header boundary', () => {
  const header = { bottom: 249 };
  const h = geometry({ mobile: true, header, cards: [{ id: 'work', top: 260, height: 100 }] });
  const anchor = h.captureCatalogueDensityAnchor(h.surface);
  h.cards[0].top = 500; header.bottom = 310;
  h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
  assert.equal(h.elements[0].getBoundingClientRect().top, 321, 'Preserve its 11px visible offset after the header grows.');
});

test('mobile profile compensation does not expand a contained viewport past its real bottom', () => {
  const h = geometry({ contained: true, mobile: true, header: { bottom: 249 }, cards: [{ id: 'below-scrollport', top: 520, height: 100 }] });
  assert.equal(h.captureCatalogueDensityAnchor(h.surface), null);
});

test('web and mobile catalogues without an occluding pinned profile header retain their existing viewport', () => {
  for (const options of [
    { header: { bottom: 249 } },
    { mobile: true },
    { mobile: true, header: { bottom: 249, position: 'static' } },
    { mobile: true, header: { bottom: 249, left: 500, right: 920 } },
    { mobile: true, header: { top: 200, bottom: 249 } },
  ]) {
    const h = geometry({ ...options, cards: [{ id: 'work', top: 49, height: 100 }] });
    const anchor = h.captureCatalogueDensityAnchor(h.surface);
    assert.equal(anchor.projectId, 'work'); assert.equal(anchor.offset, 49);
    h.cards[0].top = 349;
    h.restoreCatalogueDensityAnchor(h.surface, anchor); h.flush();
    assert.equal(h.elements[0].getBoundingClientRect().top, 49);
  }
});

test('density correction stops on new user intent and ignores hidden or removed catalogue content', () => {
  const hidden = geometry({ hidden: true }); assert.equal(hidden.captureCatalogueDensityAnchor(hidden.surface), null);
  const h = geometry(), anchor = h.captureCatalogueDensityAnchor(h.surface);
  h.restoreCatalogueDensityAnchor(h.surface, anchor);
  assert.ok(h.frames.size > 0); h.listeners.get('wheel')();
  h.cards[1].top = 300; h.flush();
  assert.equal(h.documentScroll, 0); assert.equal(h.listeners.size, 0);
  const removed = geometry(), removedAnchor = removed.captureCatalogueDensityAnchor(removed.surface);
  removed.elements.splice(1, 1); removed.restoreCatalogueDensityAnchor(removed.surface, removedAnchor);
  assert.equal(removed.documentScroll, 0); assert.equal(removed.listeners.size, 0); assert.equal(removed.frames.size, 0);
});

test('the shared provider enables exactly one project per row, adds no DOM and never activates during reorder', () => {
  const h = geometry(), child = React.createElement('div', { 'data-existing-wall': '' });
  for (const [columns, reordering, enabled] of [[1, false, true], [2, false, false], [3, false, false], [1, true, false]]) {
    const provider = new h.ProjectPageBrowsingProvider({ columns, reordering, surfaceRef: { current: h.surface }, children: child });
    const rendered = provider.render();
    assert.equal(rendered.props.value, enabled); assert.equal(rendered.props.children, child);
    assert.notEqual(typeof rendered.type, 'string', 'The provider cannot introduce a layout wrapper.');
    assert.equal(provider.getSnapshotBeforeUpdate({ columns, reordering }), null, 'Only a density transition captures a new scroll anchor.');
  }
});
