import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

// Exercises the actual continuity helper with geometry and real selection/state
// semantics. Native snapshot capture/layout are verified separately in-browser.
const artwork = (id = 'image', page = 0) => JSON.stringify([id, page]);
const box = (left = 20, top = 180, width = 180, height = 240) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const dataName = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
function splitSelectors(value, delimiter = ',') {
  const parts = []; let depth = 0, start = 0, quote = '';
  for (let index = 0; index < value.length; index++) {
    const letter = value[index];
    if (quote) { if (letter === quote && value[index - 1] !== '\\') quote = ''; continue; }
    if (letter === '"' || letter === "'") { quote = letter; continue; }
    if (letter === '(' || letter === '[') depth++;
    if (letter === ')' || letter === ']') depth--;
    if (!depth && letter === delimiter) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(value.slice(start).trim()); return parts.filter(Boolean);
}

function harness({ mobile = true, native = true, reduce = false, appReduce = false } = {}) {
  const focusCalls = [];
  let focusDocument;
  class Element {
    constructor(tag = 'div', attrs = {}, rect = box()) {
      this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = new Map(); this.children = [];
      this.parentElement = null; this.rect = rect; this.isConnected = true; this.hidden = false; this.inert = false;
      this.computed = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: 'visible', overflowY: 'visible', borderRadius: '3px' };
      const properties = new Map(); this.style = { viewTransitionName: '', setProperty: (name, value) => properties.set(name, String(value)), getPropertyValue: name => properties.get(name) ?? '', removeProperty: name => properties.delete(name) };
      this.classList = { contains: name => this.className.split(/\s+/).includes(name), add: name => { this.className = `${this.className} ${name}`.trim(); }, remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); } };
      Object.entries(attrs).forEach(([name, value]) => this.setAttribute(name, value));
    }
    get className() { return this.attributes.get('class') ?? ''; }
    set className(value) { this.attributes.set('class', value); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataName(name)] = String(value); if (name === 'hidden') this.hidden = true; if (name === 'inert') this.inert = true; }
    getAttribute(name) { return name.startsWith('data-') ? this.dataset[dataName(name)] ?? null : this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataName(name)]; if (name === 'hidden') this.hidden = false; if (name === 'inert') this.inert = false; }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; this.isConnected = false; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    getBoundingClientRect() { return this.rect; }
    getClientRects() { return this.isConnected && this.rect.width > 0 && this.rect.height > 0 ? [this.rect] : []; }
    focus(options) { focusCalls.push({ element: this, options }); focusDocument.activeElement = this; }
    matches(selector) {
      return splitSelectors(selector).some(part => {
        part = part.replace(/:(is|where)\(([^()]*)\)/g, (_, kind, choices) => this.matches(choices) ? '' : ':impossible');
        part = part.replace(/:not\(([^()]*)\)/g, (_, excluded) => this.matches(excluded) ? ':impossible' : '');
        if (part.includes(':impossible')) return false;
        const descendants = splitSelectors(part, ' ');
        if (descendants.length > 1) {
          if (!this.matches(descendants.pop())) return false;
          let ancestor = this.parentElement;
          for (let index = descendants.length - 1; index >= 0; index--) { while (ancestor && !ancestor.matches(descendants[index])) ancestor = ancestor.parentElement; if (!ancestor) return false; ancestor = ancestor.parentElement; }
          return true;
        }
        const tag = part.match(/^[a-z][\w-]*/i)?.[0]; if (tag && this.tagName !== tag.toUpperCase()) return false;
        for (const [, name] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
        for (const [, name, operator, raw] of part.matchAll(/\[([^\s=~^$*|\]]+)\s*(?:([~^$*|]?=)\s*("[^"]*"|'[^']*'|[^\]]+))?\]/g)) {
          const value = this.getAttribute(name); if (value === null) return false;
          const expected = raw?.replace(/^['"]|['"]$/g, '');
          if (operator === '=' && value !== expected) return false;
        }
        return true;
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  }
  class Image extends Element { constructor(attrs = {}, rect) { super('img', attrs, rect); this.complete = true; this.naturalWidth = 900; this.naturalHeight = 1200; this.currentSrc = '/image.webp'; this.src = this.currentSrc; } }
  class Canvas extends Element { constructor(attrs = {}, rect) { super('canvas', attrs, rect); this.width = 900; this.height = 1200; } }
  const root = new Element('html', {}, box(0, 0, 420, 912)), body = new Element('body', {}, box(0, 0, 420, 912)); root.clientWidth = 420; root.clientHeight = 912; root.append(body);
  const shell = new Element('div', { class: `codex-shell${appReduce ? ' reduce-motion' : ''}`, 'data-presentation': mobile ? 'mobile' : 'web' }, box(0, 0, 420, 912)); body.append(shell);
  const document = { documentElement: root, body, activeElement: body, querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector) };
  focusDocument = document;
  if (native) document.startViewTransition = () => {};
  const window = { innerWidth: 420, innerHeight: 912, location: { pathname: '/p/creator', search: '', hash: '' }, matchMedia: () => ({ matches: reduce }), getComputedStyle: node => node.computed, visualViewport: { offsetLeft: 0, offsetTop: 0, width: 420, height: 912 } };
  const api = sourceModule('src/utils/projectContinuity.ts', {}, { document, window, HTMLElement: Element, Element, HTMLImageElement: Image, HTMLCanvasElement: Canvas, getComputedStyle: node => node.computed, CSS: { escape: value => value } });
  const card = ({ id = 'work', owner = 'creator', identity = artwork(), rect = box(), parent = shell, image = true } = {}) => {
    const node = new Element('button', { 'data-preview-open': '', 'data-project-continuity-surface': '', 'data-project-continuity-id': id, 'data-project-continuity-owner': owner, ...(identity === undefined ? {} : { 'data-project-continuity-artwork': identity }) }, rect);
    if (image) node.append(new Image({}, rect)); parent.append(node); return node;
  };
  const reader = ({ id = 'work', attachment = 'image', page = 1, ready = true, canvas = false, rect = box(0, 90, 420, 560), parent = shell } = {}) => {
    const stage = new Element('div', { 'data-project-stage': '', 'data-project-continuity-surface': '', 'data-project-continuity-id': id }, rect);
    const cell = new Element('li', { 'data-page-cell': '', 'data-reach-attachment': attachment, 'data-project-page-number': page, 'data-project-page-ready': String(ready) }, rect);
    const media = canvas ? new Canvas({ 'data-media-page-surface': '' }, rect) : new Image({ 'data-media-page-surface': '' }, rect);
    cell.append(media); stage.append(cell); parent.append(stage); return { stage, cell, media };
  };
  return { api, root, body, shell, document, window, Element, Image, Canvas, card, reader, focusCalls,
    named: () => root.querySelectorAll('*').filter(node => node.style.viewTransitionName === 'portalink-project'),
    hide: node => { node.hidden = true; node.setAttribute('hidden', ''); }, show: node => { node.hidden = false; node.removeAttribute('hidden'); } };
}

test('MOBILE visible explicit opener selects one artwork source without assigning render-time duplicate names', () => {
  const h = harness(), source = h.card(); h.card({ rect: box(220, 180) });
  assert.equal(h.api.beginProjectContinuity('work', 'open', source), true);
  assert.deepEqual(h.named(), [source]); assert.equal(h.api.isProjectContinuityActive(), true); assert.equal(h.api.isMobileProjectContinuity(), true);
  assert.equal(h.api.projectContinuityStyle('work'), undefined); assert.equal(h.root.dataset.projectContinuity, 'open');
});

test('MOBILE keyboard-focused valid card wins; an ambiguous unfocused pair skips shared travel', () => {
  const focused = harness(), first = focused.card(), second = focused.card({ rect: box(220, 180) }); focused.document.activeElement = second.children[0];
  assert.equal(focused.api.beginProjectContinuity('work'), true); assert.deepEqual(focused.named(), [second]); assert.notEqual(focused.named()[0], first);
  const ambiguous = harness(); ambiguous.card(); ambiguous.card({ rect: box(220, 180) });
  assert.equal(ambiguous.api.beginProjectContinuity('work'), false); assert.deepEqual(ambiguous.named(), []); assert.equal(ambiguous.api.isProjectContinuityActive(), false);
});

test('MOBILE ignores a hidden retained duplicate and accepts the sole visible matching card', () => {
  const h = harness(), retained = new h.Element('section', { inert: '', 'aria-hidden': 'true' }); h.shell.append(retained); h.card({ parent: retained }); const visible = h.card();
  assert.equal(h.api.beginProjectContinuity('work'), true); assert.deepEqual(h.named(), [visible]);
});

test('MOBILE missing, detached, empty, hidden, transparent and off-screen sources skip shared animation', () => {
  const invalid = {
    missing: () => null,
    detached: h => { const node = h.card(); node.isConnected = false; return node; },
    empty: h => h.card({ rect: box(20, 180, 0, 240) }),
    hidden: h => { const node = h.card(); h.hide(node); return node; },
    inertAncestor: h => { const parent = new h.Element('section', { inert: '' }); h.shell.append(parent); return h.card({ parent }); },
    ariaHiddenAncestor: h => { const parent = new h.Element('section', { 'aria-hidden': 'true' }); h.shell.append(parent); return h.card({ parent }); },
    displayNone: h => { const node = h.card(); node.computed.display = 'none'; return node; },
    visibilityHidden: h => { const node = h.card(); node.computed.visibility = 'hidden'; return node; },
    transparentAncestor: h => { const parent = new h.Element(); parent.computed.opacity = '0'; h.shell.append(parent); return h.card({ parent }); },
    belowViewport: h => h.card({ rect: box(20, 950) }),
    leftOfViewport: h => h.card({ rect: box(-200, 180, 180, 240) }),
  };
  for (const [name, make] of Object.entries(invalid)) {
    const h = harness(), node = make(h);
    assert.equal(h.api.beginProjectContinuity('work', 'open', node ?? undefined), false, name);
    assert.equal(h.api.isMobileProjectContinuity(), true, name); assert.equal(h.api.isProjectContinuityActive(), false, name); assert.deepEqual(h.named(), [], name);
  }
});

test('MOBILE a source clipped by a scrolling ancestor is excluded without changing scroll', () => {
  const h = harness(), clipping = new h.Element('section', {}, box(0, 100, 420, 100)); clipping.computed.overflowY = 'auto'; clipping.scrollTop = 240; h.shell.append(clipping);
  const source = h.card({ parent: clipping, rect: box(20, 260, 180, 200) });
  assert.equal(h.api.beginProjectContinuity('work', 'open', source), false); assert.equal(clipping.scrollTop, 240); assert.deepEqual(h.named(), []);
});

test('MOBILE visible viewport offsets and partial exposure determine eligibility without moving the page', () => {
  const exposed = harness(), partial = exposed.card({ rect: box(20, 880, 180, 240) });
  assert.equal(exposed.api.beginProjectContinuity('work', 'open', partial), true, 'A partially visible card remains a meaningful source.');
  const obscured = harness(); obscured.window.visualViewport = { offsetLeft: 0, offsetTop: 100, width: 420, height: 500 };
  const above = obscured.card({ rect: box(20, 20, 180, 70) });
  assert.equal(obscured.api.beginProjectContinuity('work', 'open', above), false, 'Artwork outside the current visual viewport is not visible.');
});

test('MOBILE explicit wrong-project, unpainted and unidentified artwork cannot morph into another work', () => {
  for (const mode of ['different-project', 'unpainted', 'no-identity']) {
    const h = harness(), source = h.card({ id: mode === 'different-project' ? 'other' : 'work' });
    if (mode === 'unpainted') { source.children[0].complete = false; source.children[0].naturalWidth = 0; }
    if (mode === 'no-identity') delete source.dataset.projectContinuityArtwork;
    assert.equal(h.api.beginProjectContinuity('work', 'open', source), false, mode); assert.deepEqual(h.named(), [], mode);
  }
});

test('MOBILE an explicit invalid opener never substitutes a different visible duplicate', () => {
  const h = harness(), explicit = h.card({ rect: box(20, 1400) }); h.card();
  assert.equal(h.api.beginProjectContinuity('work', 'open', explicit), false); assert.deepEqual(h.named(), []);
});

test('MOBILE the same route-helper call preserves a rejected explicit source instead of choosing its visible duplicate', () => {
  const h = harness(), explicit = h.card({ rect: box(20, 1400) }); h.card();
  assert.equal(h.api.beginProjectContinuity('work', 'open', explicit), false);
  assert.equal(h.api.beginProjectContinuity('work'), false, 'The route helper cannot reverse the original activation eligibility decision.');
  assert.equal(h.api.isProjectContinuityActive(), false); assert.equal(h.api.isMobileProjectContinuity(), true); assert.deepEqual(h.named(), []);
});

test('MOBILE repeated valid explicit activation and route-helper calls keep one selected source', () => {
  const h = harness(), selected = h.card(); h.card({ rect: box(220, 180) });
  assert.equal(h.api.beginProjectContinuity('work', 'open', selected), true);
  assert.equal(h.api.beginProjectContinuity('work'), true); assert.deepEqual(h.named(), [selected]);
  assert.equal(h.api.beginProjectContinuity('work', 'open', selected), true);
  assert.equal(h.api.beginProjectContinuity('work'), true); assert.deepEqual(h.named(), [selected]);
  assert.equal(h.api.isProjectContinuityActive(), true);
});

test('MOBILE opening pairs the selected image with matching ready media rather than the first page or reader stage', () => {
  const h = harness(), source = h.card({ identity: artwork('selected') });
  assert.equal(h.api.beginProjectContinuity('work', 'open', source), true); h.hide(source);
  const first = h.reader({ attachment: 'unrelated' }), selected = h.reader({ attachment: 'selected', page: 3 });
  assert.equal(h.api.markProjectContinuityDestination(), true); assert.deepEqual(h.named(), [selected.media]);
  assert.notEqual(h.named()[0], first.media); assert.notEqual(h.named()[0], selected.stage);
});

test('MOBILE document cover pairs its actual ready PDF page and skips a different or incomplete page', () => {
  for (const mode of ['matching', 'wrong-page', 'unready', 'blank-canvas']) {
    const h = harness(), source = h.card({ identity: artwork('document', 4) }); assert.equal(h.api.beginProjectContinuity('work', 'open', source), true); h.hide(source);
    const destination = h.reader({ attachment: 'document', page: mode === 'wrong-page' ? 1 : 4, ready: mode !== 'unready', canvas: true });
    if (mode === 'blank-canvas') destination.media.width = 0;
    assert.equal(h.api.markProjectContinuityDestination(), mode === 'matching', mode);
    assert.deepEqual(h.named(), mode === 'matching' ? [destination.media] : [], mode);
  }
});

test('MOBILE unready or hidden matching image destinations never borrow another visible page', () => {
  for (const mode of ['unready', 'unpainted', 'hidden-reader']) {
    const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.hide(source);
    const selected = h.reader({ ready: mode !== 'unready' }); h.reader({ attachment: 'unrelated' });
    if (mode === 'unpainted') { selected.media.complete = false; selected.media.naturalWidth = 0; }
    if (mode === 'hidden-reader') h.hide(selected.stage);
    assert.equal(h.api.markProjectContinuityDestination(), false, mode); assert.deepEqual(h.named(), [], mode);
  }
});

test('MOBILE a cold return with no captured card origin does not invent a shared-element relationship', () => {
  const h = harness(); h.reader();
  assert.equal(h.api.beginProjectContinuity('work', 'return'), false); assert.deepEqual(h.named(), []); assert.equal(h.api.isMobileProjectContinuity(), true);
});

test('MOBILE completed opening retains bounded origin identity for matching return and visible restored card', () => {
  const h = harness(), source = h.card({ identity: artwork('selected') }); h.api.beginProjectContinuity('work', 'open', source); h.hide(source);
  const unrelated = h.reader({ attachment: 'unrelated' }), selected = h.reader({ attachment: 'selected', page: 3 }); h.api.markProjectContinuityDestination(); h.api.finishProjectContinuity();
  assert.equal(h.api.beginProjectContinuity('work', 'return'), true); assert.deepEqual(h.named(), [selected.media]);
  h.hide(unrelated.stage); h.hide(selected.stage); h.show(source);
  assert.equal(h.api.markProjectContinuityDestination(), true); assert.deepEqual(h.named(), [source]); assert.equal(h.root.dataset.projectContinuity, 'return');
});

test('MOBILE return skips a missing, off-screen or changed artwork destination without scrolling', () => {
  for (const mode of ['missing', 'offscreen', 'changed']) {
    const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.hide(source); const reader = h.reader(); h.api.markProjectContinuityDestination(); h.api.finishProjectContinuity();
    assert.equal(h.api.beginProjectContinuity('work', 'return'), true); h.hide(reader.stage); h.show(source);
    if (mode === 'missing') source.remove();
    if (mode === 'offscreen') source.rect = box(20, 1100);
    if (mode === 'changed') source.dataset.projectContinuityArtwork = artwork('different-cover');
    assert.equal(h.api.markProjectContinuityDestination(), false, mode); assert.deepEqual(h.named(), [], mode);
  }
});

test('MOBILE a new project origin replaces the prior relationship and cannot return to its artwork', () => {
  const h = harness(), first = h.card(); h.api.beginProjectContinuity('work', 'open', first); h.api.finishProjectContinuity();
  const second = h.card({ id: 'second', identity: artwork('second-image') }); h.api.beginProjectContinuity('second', 'open', second); h.api.finishProjectContinuity();
  h.reader();
  assert.equal(h.api.beginProjectContinuity('work', 'return'), false); assert.deepEqual(h.named(), []);
});

test('MOBILE reduced motion and unsupported native transitions leave immediate navigation authority without visual marks', () => {
  for (const options of [{ reduce: true }, { appReduce: true }, { native: false }]) {
    const h = harness(options), source = h.card();
    assert.equal(h.api.beginProjectContinuity('work', 'open', source), false); assert.equal(h.api.isProjectContinuityActive(), false); assert.equal(h.api.isMobileProjectContinuity(), true);
    assert.equal(h.api.projectContinuityStyle('work'), undefined); assert.deepEqual(h.named(), []); assert.equal(h.root.dataset.projectContinuity, undefined);
  }
});

test('MOBILE cleanup removes every owned name, hero and root flag without losing a later return relationship', () => {
  const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.hide(source); const reader = h.reader(); h.api.markProjectContinuityDestination();
  h.api.finishProjectContinuity();
  assert.deepEqual(h.named(), []); assert.equal(h.api.isProjectContinuityActive(), false); assert.equal(h.api.isMobileProjectContinuity(), false); assert.equal(h.root.dataset.projectContinuity, undefined);
  assert.equal(h.root.style.getPropertyValue('--motion-page-aspect'), ''); assert.equal(reader.media.dataset.motionProjectHero, undefined); assert.equal(h.api.projectContinuityStyle('work'), undefined);
  assert.equal(h.api.beginProjectContinuity('work', 'return'), true);
});

test('WEB retains its existing source choice, render-time named style and destination return contract', () => {
  const h = harness({ mobile: false }), first = h.card(), focused = h.card({ rect: box(20, 1400) }); h.document.activeElement = focused.children[0];
  assert.equal(h.api.beginProjectContinuity('work'), true); assert.deepEqual(h.named(), [focused]); assert.notEqual(h.named()[0], first); assert.equal(h.api.isMobileProjectContinuity(), false);
  assert.equal(h.api.projectContinuityStyle('work').viewTransitionName, 'portalink-project'); assert.equal(h.api.projectContinuityStyle('other'), undefined);
  assert.equal(h.api.markProjectContinuityDestination(), undefined); h.api.finishProjectContinuity(); assert.deepEqual(h.named(), []);
});

test('MOBILE focus remembers explicit activation even when reduced motion or unsupported transitions skip artwork travel', () => {
  for (const options of [{}, { reduce: true }, { appReduce: true }, { native: false }]) {
    const h = harness(options), source = h.card();
    h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); h.document.activeElement = h.body;
    h.api.focusMobileProjectOrigin(h.shell, 'creator');
    assert.equal(h.document.activeElement, source); assert.equal(h.focusCalls.length, 1);
    assert.equal(h.focusCalls[0].options.preventScroll, true, 'Focus restoration must not replace the catalogue scroll restoration.');
  }
});

test('MOBILE return focus accepts the sole recreated card with the captured project identity', () => {
  const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); source.remove();
  h.card({ id: 'unrelated' }); const recreated = h.card(); h.document.activeElement = h.body;
  h.api.focusMobileProjectOrigin(h.shell, 'creator');
  assert.equal(h.document.activeElement, recreated); assert.equal(h.focusCalls.length, 1); assert.equal(h.focusCalls[0].options.preventScroll, true);
});

test('MOBILE missing, hidden or off-screen origin focuses the catalogue heading without moving it', () => {
  for (const mode of ['missing', 'hidden', 'offscreen']) {
    const h = harness(), source = h.card(), heading = new h.Element('h1', {}, box(20, 20, 250, 48)); h.shell.append(heading);
    h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity();
    if (mode === 'missing') source.remove();
    if (mode === 'hidden') h.hide(source);
    if (mode === 'offscreen') source.rect = box(20, 1400);
    h.document.activeElement = h.body; h.api.focusMobileProjectOrigin(h.shell, 'creator');
    assert.equal(h.document.activeElement, heading, mode); assert.equal(heading.tabIndex, -1, mode); assert.equal(h.focusCalls[0].options.preventScroll, true, mode);
  }
});

test('MOBILE return focus preserves a visible active control instead of taking focus from the user', () => {
  const h = harness(), source = h.card(), control = new h.Element('button', {}, box(220, 20, 100, 44)); h.shell.append(control);
  h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); h.document.activeElement = control;
  h.api.focusMobileProjectOrigin(h.shell, 'creator');
  assert.equal(h.document.activeElement, control); assert.equal(h.focusCalls.length, 0);
  h.document.activeElement = h.body; h.api.focusMobileProjectOrigin(h.shell, 'creator');
  assert.equal(h.focusCalls.length, 0, 'Respecting user-owned focus consumes the pending return rather than replaying it later.');
});

test('WEB focus restoration stays untouched even with matching artwork and a catalogue heading', () => {
  const h = harness({ mobile: false }), source = h.card(), heading = new h.Element('h1'); h.shell.append(heading);
  h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); h.document.activeElement = h.body;
  h.api.focusMobileProjectOrigin(h.shell, 'creator');
  assert.equal(h.document.activeElement, h.body); assert.equal(h.focusCalls.length, 0); assert.equal(heading.tabIndex, undefined);
});

test('MOBILE focus authority requires a committed reader of the same owner and is consumed exactly once', () => {
  const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.document.activeElement = h.body;
  h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.focusCalls.length, 0, 'A card activation without a committed reader does not authorize return focus.');
  h.api.noteMobileProfileProject('different-owner'); h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.focusCalls.length, 0);
  h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity();
  h.api.focusMobileProjectOrigin(h.shell, 'different-owner'); assert.equal(h.focusCalls.length, 0, 'A different catalogue owner cannot consume the captured origin.');
  h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.document.activeElement, source); assert.equal(h.focusCalls.length, 1);
  h.document.activeElement = h.body; h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.focusCalls.length, 1);
});

test('MOBILE another route, catalogue query or fragment cannot consume the original focus relationship', () => {
  for (const changed of [{ pathname: '/settings' }, { search: '?view=portals' }, { hash: '#another-view' }]) {
    const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity();
    Object.assign(h.window.location, changed); h.document.activeElement = h.body; h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.focusCalls.length, 0);
    Object.assign(h.window.location, { pathname: '/p/creator', search: '', hash: '' }); h.api.focusMobileProjectOrigin(h.shell, 'creator');
    assert.equal(h.document.activeElement, source); assert.equal(h.focusCalls.length, 1);
  }
});

test('MOBILE a different programmatic project opening discards an earlier explicit focus origin', () => {
  const h = harness(), source = h.card(); h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity();
  h.api.beginProjectContinuity('other-project'); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); h.document.activeElement = h.body;
  h.api.focusMobileProjectOrigin(h.shell, 'creator'); assert.equal(h.focusCalls.length, 0); assert.equal(h.document.activeElement, h.body);
});

test('MOBILE a later same-project programmatic opening cannot reuse an earlier completed activation focus origin', () => {
  const h = harness(), source = h.card();
  h.api.beginProjectContinuity('work', 'open', source); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity();
  h.api.beginProjectContinuity('work'); h.api.noteMobileProfileProject('creator'); h.api.finishProjectContinuity(); h.document.activeElement = h.body;
  h.api.focusMobileProjectOrigin(h.shell, 'creator');
  assert.equal(h.focusCalls.length, 0); assert.equal(h.document.activeElement, h.body, 'A distinct programmatic visit needs its own explicit source relationship.');
});

test('artwork identity follows stored source provenance and a document cover page rather than URL equality alone', () => {
  const h = harness(), image = { id: 'image', kind: 'image', sourceUrl: '/photo.webp', order: 1, isCover: true }, pdf = { id: 'document', kind: 'document', sourceUrl: '/report.pdf', order: 0, isCover: true };
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '/photo.webp', attachments: [image] }), artwork('image'));
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '/report.pdf', coverKind: 'document', coverPageNumber: 4, attachments: [pdf] }), artwork('document', 4));
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '/stored-thumb.webp', coverThumbnail: { sourceAttachmentId: 'document' }, coverKind: 'document', coverPageNumber: 4, attachments: [] }), artwork('document', 4));
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '/unrelated.webp', attachments: [image] }), undefined);
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '/stored-thumb.webp', coverThumbnail: { sourceAttachmentId: 'image' }, attachments: [] }), artwork('image'), 'Canonical cover-only list records retain trusted attachment identity without loading originals.');
});

test('shared cover fallback follows actual ordered attachment artwork and never fabricates unsupported media identity', () => {
  const h = harness(), image = { id: 'image', kind: 'image', sourceUrl: '/photo.webp', order: 2 }, pdf = { id: 'document', kind: 'document', sourceUrl: '/report.pdf', order: 1 }, video = { id: 'video', kind: 'video', sourceUrl: '/clip.mp4', order: 0 };
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '', attachments: [image, pdf] }), undefined);
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '', attachments: [image, pdf] }, true), artwork('document', 1));
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '', coverPageNumber: 4, attachments: [image, pdf] }, true), artwork('document', 1));
  assert.equal(h.api.getProjectContinuityArtwork({ id: 'work', cover: '', attachments: [image, pdf, video] }, true), undefined);
});
