import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('../src/data/portal-icon-catalog.json', import.meta.url), 'utf8'));
function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, { ...globals, exports, require: name => name in imports ? imports[name] : require(name) });
  return exports;
}
const icons = load('../src/components/profile/categoryIcons.ts', { '../../data/portal-icon-catalog.json': catalog });

test('expanded catalog preserves legacy and profile-link IDs and rejects unknown icon paths', () => {
  assert.equal(icons.categoryIconNames.length, 58);
  assert.equal(icons.profileLinkIconOptions.length, 77);
  assert.ok(icons.portalIconNames.length > 1600);
  assert.equal(new Set(icons.portalIconNames).size, icons.portalIconNames.length);
  assert.equal(icons.getCategoryIcon('book'), require('lucide-react').BookOpenIcon);
  assert.equal(icons.getCategoryIcon('x'), require('react-icons/si').SiX);
  for (const name of ['unknown', '__proto__', 'lucide:../camera', 'lucide:<script>']) {
    assert.equal(icons.getCategoryIcon(name), require('lucide-react').ShapesIcon);
  }
  assert.equal(icons.getCategoryIcon('lucide:telescope'), icons.getCategoryIcon('lucide:telescope'), 'stable renderer identity');
  const markup = renderToStaticMarkup(React.createElement(icons.getCategoryIcon('lucide:telescope'), { className: 'preview', stroke: 'red' }));
  assert.match(markup, /class="preview"/);
  assert.match(markup, /stroke="red"/);
  assert.ok(markup.includes(`${catalog.sprite}#telescope`));
});

test('every library icon has a local symbol and searchable readable name', () => {
  const svg = readFileSync(new URL(`../public${catalog.sprite.split('?')[0]}`, import.meta.url), 'utf8');
  for (const name of catalog.names) assert.ok(svg.includes(`<symbol id="${name}"`), name);
  assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+=|\shref=/i);
  assert.equal(icons.getPortalIconLabel('lucide:alarm-clock'), 'Alarm Clock');
  assert.deepEqual([...icons.searchPortalIcons(' ALARM clock ')], [...icons.searchPortalIcons('alarm-clock')]);
  assert.ok(icons.searchPortalIcons('telescope').includes('lucide:telescope'));
  assert.equal(icons.searchPortalIcons('xyz-no-such-icon').length, 0);
});

function harness(selected = 'shapes', { presentation = 'web', scrollRoot = null, observerAvailable = true } = {}) {
  const slots = [], effects = [], refs = [], observers = [];
  let cursor = 0, dirty = false, stateUpdates = 0;
  const marker = { closest(selector) {
    assert.equal(selector, '[data-portal-icon-scroll]');
    return scrollRoot;
  } };
  class IntersectionObserverMock {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.disconnected = false;
      observers.push(this);
    }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    // Deliberately deliver queued callbacks after disconnect to test cleanup guards.
    fire(isIntersecting = true) { this.callback([{ target: this.target, isIntersecting }]); }
  }
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(slots[index], value)) { slots[index] = value; dirty = true; stateUpdates++; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = { current: initial }; refs.push(slots[index]); }
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps: [...deps], cleanup: effect() };
        });
      }
    },
  };
  const { PortalIconLibrary } = load('../src/components/profile/PortalIconLibrary.tsx', {
    react, './categoryIcons': icons, '../ui/InterfaceIcon': { InterfaceIcon: () => null },
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
  }, observerAvailable ? { IntersectionObserver: IntersectionObserverMock } : {});
  const props = { selected, compact: true, onSelect: name => { props.selected = name; } };
  return {
    props, observers, marker,
    get stateUpdates() { return stateUpdates; },
    setPresentation(next) { presentation = next; },
    render() {
      let tree, passes = 0;
      do {
        assert.ok(passes++ < 10, 'effects settle without a render loop');
        cursor = 0; dirty = false;
        tree = PortalIconLibrary(props);
        refs.forEach(ref => { ref.current = null; });
        all(tree).forEach(node => { if (node.ref && typeof node.ref === 'object') node.ref.current = marker; });
        effects.splice(0).forEach(effect => effect());
      } while (dirty);
      return tree;
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
      refs.forEach(ref => { ref.current = null; });
    },
  };
}
const all = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(all)] : [];
const radios = tree => all(tree).filter(node => node.props.role === 'radio');
const search = tree => all(tree).find(node => node.type === 'input');

test('picker bounds rendering, searches, exposes a tab stop and does not reorder during selection', () => {
  const h = harness(); let tree = h.render();
  assert.equal(radios(tree).length, 60);
  const before = radios(tree).map(node => node.key);
  radios(tree)[5].props.onClick(); tree = h.render();
  assert.deepEqual(radios(tree).map(node => node.key), before);
  all(tree).find(node => node.props.children === 'Show more icons').props.onClick();
  assert.equal(radios(h.render()).length, 120);
  search(tree).props.onChange({ target: { value: 'telescope' } }); tree = h.render();
  assert.equal(radios(tree).length, 1);
  assert.equal(radios(tree)[0].props.tabIndex, 0);
  assert.equal(radios(tree)[0].props['aria-checked'], false);
  radios(tree)[0].props.onClick();
  assert.equal(h.props.selected, 'lucide:telescope');
  h.props.disabled = true;
  assert.ok(radios(h.render()).every(node => node.props.disabled));
  assert.equal(search(h.render()).props.autoFocus, undefined);
});

test('reopening locates a saved extended icon; no-result search retains that selection', () => {
  const h = harness('lucide:telescope'); let tree = h.render();
  assert.equal(radios(tree)[0].props['aria-checked'], true);
  search(tree).props.onChange({ target: { value: 'xyz-no-such-icon' } });
  assert.equal(radios(h.render()).length, 0);
  assert.equal(h.props.selected, 'lucide:telescope');
  search(h.render()).props.onChange({ target: { value: '' } });
  assert.equal(radios(h.render()).length, 60);
  assert.equal(radios(h.render())[0].props['aria-checked'], true);
});

test('parent-owned search replaces the standalone field and bounds each new query', () => {
  const h = harness();
  h.props.searchQuery = '';
  let tree = h.render();
  assert.equal(search(tree), undefined);
  all(tree).find(node => node.props.children === 'Show more icons').props.onClick();
  assert.equal(radios(h.render()).length, 120);
  h.props.searchQuery = 'telescope';
  assert.equal(radios(h.render()).length, 1);
  h.props.searchQuery = 'arrow';
  assert.equal(radios(h.render()).length, 60);
});

test('mobile automatically continues in bounded batches inside the portal dialog scroller', () => {
  const scrollRoot = { id: 'portal-dialog-content' };
  const h = harness('lucide:telescope', { presentation: 'mobile', scrollRoot });
  let tree = h.render();
  assert.equal(radios(tree).length, 60);
  assert.equal(all(tree).some(node => node.props.children === 'Show more icons'), false);
  const firstKeys = radios(tree).map(node => node.key);
  const observer = h.observers.at(-1);
  assert.equal(observer.options.root, scrollRoot);
  assert.equal(observer.options.rootMargin, '400px 0px');
  assert.equal(observer.target, h.marker);
  observer.fire(false);
  assert.equal(radios(h.render()).length, 60);
  observer.fire();
  observer.fire();
  tree = h.render();
  assert.equal(radios(tree).length, 120, 'one batch per observer even with repeated callbacks');
  assert.equal(observer.disconnected, true);
  assert.deepEqual(radios(tree).slice(0, 60).map(node => node.key), firstKeys);
  assert.equal(radios(tree)[0].props['aria-checked'], true);
  assert.equal(radios(tree).filter(node => node.props.tabIndex === 0).length, 1);
  while (radios(tree).length < icons.portalIconNames.length) {
    const before = radios(tree).length;
    h.observers.at(-1).fire();
    tree = h.render();
    assert.equal(radios(tree).length, Math.min(before + 60, icons.portalIconNames.length));
  }
  assert.equal(new Set(radios(tree).map(node => node.key)).size, icons.portalIconNames.length);
  assert.equal(h.observers.at(-1).disconnected, true);
  const updates = h.stateUpdates;
  h.observers.at(-1).fire();
  assert.equal(h.stateUpdates, updates, 'completed catalog cannot append again');
});

test('mobile search resets its batch and ignores callbacks from the previous query', () => {
  const h = harness('shapes', { presentation: 'mobile' });
  let tree = h.render();
  const originalObserver = h.observers.at(-1);
  assert.equal(originalObserver.options.root, null, 'full-page picker uses the viewport');
  originalObserver.fire(); tree = h.render();
  assert.equal(radios(tree).length, 120);
  const oldQueryObserver = h.observers.at(-1);
  search(tree).props.onChange({ target: { value: 'arrow' } }); tree = h.render();
  assert.equal(radios(tree).length, 60);
  assert.equal(oldQueryObserver.disconnected, true);
  const updates = h.stateUpdates;
  oldQueryObserver.fire();
  assert.equal(h.stateUpdates, updates);
  const arrowObserver = h.observers.at(-1);
  h.props.searchQuery = 'telescope'; tree = h.render();
  assert.equal(radios(tree).length, 1);
  assert.equal(arrowObserver.disconnected, true);
  arrowObserver.fire();
  assert.equal(radios(h.render()).length, 1);
  h.props.searchQuery = 'xyz-no-such-icon';
  assert.equal(radios(h.render()).length, 0);
  assert.equal(h.props.selected, 'shapes');
  h.props.searchQuery = '';
  assert.equal(radios(h.render()).length, 60);
});

test('mobile disconnects on save, presentation change and unmount without stale state updates', () => {
  const h = harness('shapes', { presentation: 'mobile' });
  h.render();
  const beforeSave = h.observers.at(-1);
  h.props.disabled = true;
  assert.ok(radios(h.render()).every(node => node.props.disabled));
  assert.equal(beforeSave.disconnected, true);
  const disabledUpdates = h.stateUpdates;
  beforeSave.fire();
  assert.equal(h.stateUpdates, disabledUpdates);
  assert.equal(h.observers.length, 1);
  h.props.disabled = false; h.render();
  const beforeWeb = h.observers.at(-1);
  h.setPresentation('web');
  const tree = h.render();
  assert.equal(beforeWeb.disconnected, true);
  beforeWeb.fire();
  assert.equal(h.stateUpdates, disabledUpdates);
  const more = all(tree).find(node => node.props.children === 'Show more icons');
  assert.ok(more, 'WEB retains explicit continuation');
  more.props.onClick();
  assert.equal(radios(h.render()).length, 120);
  h.setPresentation('mobile'); h.render();
  const beforeUnmount = h.observers.at(-1);
  const unmountUpdates = h.stateUpdates;
  h.unmount();
  assert.equal(beforeUnmount.disconnected, true);
  beforeUnmount.fire();
  assert.equal(h.stateUpdates, unmountUpdates);
});

test('mobile remains browsable without IntersectionObserver while WEB stays bounded', () => {
  const h = harness('shapes', { presentation: 'mobile', observerAvailable: false });
  h.props.disabled = true;
  assert.equal(radios(h.render()).length, 60, 'saving does not trigger the fallback');
  h.props.disabled = false;
  let tree = h.render();
  assert.equal(radios(tree).length, icons.portalIconNames.length);
  assert.equal(all(tree).some(node => node.props.children === 'Show more icons'), false);
  h.props.searchQuery = 'telescope'; tree = h.render();
  assert.equal(radios(tree).length, 1);
  assert.equal(h.props.selected, 'shapes');
  const web = harness('shapes', { observerAvailable: false });
  assert.equal(radios(web.render()).length, 60);
  assert.ok(all(web.render()).some(node => node.props.children === 'Show more icons'));
});

function dialogHarness() {
  const slots = [], calls = []; let cursor = 0;
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() { cursor++; },
  };
  const Library = () => null;
  const { NewCategoryDialog } = load('../src/components/profile/NewCategoryDialog.tsx', {
    react, './categoryIcons': icons, './PortalIconLibrary': { PortalIconLibrary: Library },
    '../ui/InterfaceIcon': { InterfaceIcon: () => null }, '../ui/ModalPortal': { ModalPortal: ({ children }) => children },
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' },
    '../../hooks/useModalFocus': { useModalFocus() {} },
  });
  const props = { itemName: 'portal', onCancel: () => calls.push('cancel'), onCreate: (...args) => calls.push(args) };
  return { props, calls, render() { cursor = 0; return NewCategoryDialog(props); }, library: tree => all(tree).find(node => node.type === Library) };
}
const toggle = tree => all(tree).find(node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean');
const form = tree => all(tree).find(node => node.type === 'form');

test('New portal keeps its title through search and selection without creating prematurely', () => {
  const h = dialogHarness(); let tree = h.render();
  const scrollContainer = all(tree).find(node => 'data-portal-icon-scroll' in node.props);
  assert.ok(scrollContainer?.props.className.includes('overflow-y-auto'));
  assert.ok(all(scrollContainer).some(node => node.type === h.library(tree).type), 'library observes the existing dialog scroll region');
  assert.ok(!all(scrollContainer).some(node => 'data-icon-create-preview' in node.props), 'selected preview stays outside the scrolling catalog');
  search(tree).props.onChange({ target: { value: '  Astronomy  ' } });
  tree = h.render(); toggle(tree).props.onClick(); tree = h.render();
  assert.equal(search(tree).props.type, 'search');
  assert.equal(search(tree).props.value, '');
  assert.equal(search(tree).props.maxLength, undefined);
  search(tree).props.onChange({ target: { value: 'telescope' } }); tree = h.render();
  assert.equal(h.library(tree).props.searchQuery, 'telescope');
  let prevented = false;
  search(tree).props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
  h.library(tree).props.onSelect('lucide:telescope'); tree = h.render();
  assert.equal(search(tree).props.type, 'text');
  assert.equal(search(tree).props.value, '  Astronomy  ');
  assert.equal(h.library(tree).props.searchQuery, '');
  assert.equal(h.library(tree).props.selected, 'lucide:telescope');
  assert.equal(h.calls.length, 0);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.deepEqual(h.calls, [['Astronomy', 'lucide:telescope']]);
});

test('search cancellation preserves the draft and saving locks both modes', () => {
  const h = dialogHarness(); let tree = h.render();
  search(tree).props.onChange({ target: { value: 'Design' } });
  toggle(h.render()).props.onClick(); tree = h.render();
  search(tree).props.onChange({ target: { value: 'camera' } });
  toggle(h.render()).props.onClick(); tree = h.render();
  assert.equal(search(tree).props.value, 'Design');
  assert.equal(h.library(tree).props.selected, 'shapes');
  assert.equal(h.calls.length, 0);
  h.props.isSaving = true; tree = h.render();
  assert.equal(search(tree).props.disabled, true);
  assert.equal(toggle(tree).props.disabled, true);
  assert.equal(h.library(tree).props.disabled, true);
  form(tree).props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 0);
});

test('link picker brands remain selectable and distinguish same-name outline icons', () => {
  const h = harness('instagram', { presentation: 'mobile' });
  h.props.additionalOptions = icons.profileLinkIconOptions;
  h.props.searchQuery = 'instagram';
  const options = radios(h.render());
  assert.ok(options.some(node => node.props['aria-label'] === 'Instagram' && node.props['aria-checked']));
  assert.ok(options.some(node => node.props['aria-label'] === 'Instagram (outline)'));
  options.find(node => node.props['aria-label'] === 'Instagram (outline)').props.onClick();
  assert.notEqual(h.props.selected, 'instagram');
  h.props.searchQuery = 'youtube';
  const brand = radios(h.render()).find(node => node.props['aria-label'] === 'YouTube');
  assert.ok(brand);
  brand.props.onClick();
  assert.equal(h.props.selected, 'youtube');
});
