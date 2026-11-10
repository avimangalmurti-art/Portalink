import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const model = sourceModule('src/features/citations/model.ts');
const formats = sourceModule('src/features/citations/formats.ts', { './model': model }, { Date });
const source = { id: 'source-page', attachmentId: 'attachment', creatorId: 'source-owner', projectId: 'source-project', creator: 'Source creator', projectTitle: 'Source work', kind: 'page', number: 3, madeOn: '2026-10-20', citable: true, storagePath: null };
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

/** Actual CiteSheet rendering; motion records whether dismissal releases the owning hook at intent. */
function fixture({ presentation = 'mobile', item = null, managed = true, reader = false, reduce = false } = {}) {
  const slots = [], dom = new Map(), motionCalls = [], writes = [], copies = [], citations = [];
  let cursor = 0, effects = [], dirty = true, mounted = true, tree, modal, closed = 0, retries = 0, cited = 0, projectReads = 0, focusAtRetry;
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { if (!mounted) return; const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }]; },
    useEffect(callback, dependencies) { const index = cursor++, prior = slots[index]; if (!equal(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; effects.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); } },
  };
  class Element { closest() { return null; } focus(options) { this.focusOptions = options; } }
  const onClose = () => { closed++; unmount(); };
  const props = { item, onClose, onCited: () => cited++, opening: managed ? { error: '', onRetry: () => { focusAtRetry = [...dom.values()].find(element => element.props.role === 'dialog')?.focusOptions; retries++; } } : undefined };
  const { CiteSheet } = sourceModule('src/features/citations/CiteSheet.tsx', {
    react, './publicOrigin': { PUBLIC_ORIGIN: 'https://portalink.example' }, './model': model, './formats': formats, './citations.css': {},
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../presentation/motion/motion': { reducedMotion: () => reduce },
    '../../presentation/motion/useSheetMotion': { useSheetMotion: () => ({ closing: false, close(...args) { motionCalls.push(args); args[0]?.(); } }) },
    '../../hooks/useModalFocus': { useModalFocus(open, dialog, onEscape, preventScroll) { modal = { open, dialog, onEscape, preventScroll }; } },
    '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: true, viewerProfileId: reader ? 'reader' : source.creatorId, phase: 'authenticated', isInitializing: false }) },
    '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' }, 'lucide-react': { CheckIcon: 'check-icon' }, '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../../services/supabase/client': { requireSupabase: () => ({ from(name) { assert.equal(name, 'projects'); return { select() { return { eq(_key, owner) { assert.equal(owner, 'reader'); return { async order() { projectReads++; return { data: [{ id: 'my-project', title: 'My project' }], error: null }; } }; } }; } }; } }) },
    './service': { citeItem(...args) { return new Promise((resolve, reject) => citations.push({ args, resolve, reject })); }, citationNote() { assert.fail('Opening and copying must not save a reference note.'); } },
  }, { Element, navigator: { clipboard: { writeText(value) { writes.push(value); return new Promise((resolve, reject) => copies.push({ resolve, reject })); } } } });
  function commit(node, path = 'root') {
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'string') {
      const element = dom.get(path) ?? new Element(); dom.set(path, element); element.props = node.props;
      if (typeof node.ref === 'function') node.ref(element); else if (node.ref) node.ref.current = element;
    }
    React.Children.toArray(node.props.children).forEach((child, index) => commit(child, `${path}.${index}`));
  }
  function render(changes = {}) {
    Object.assign(props, changes); dirty = true;
    for (let pass = 0; mounted && dirty; pass++) { assert.ok(pass < 12, 'Sheet state must settle'); dirty = false; cursor = 0; effects = []; tree = CiteSheet(props); commit(tree); effects.splice(0).forEach(callback => callback()); }
    return tree;
  }
  function unmount() { if (!mounted) return; mounted = false; slots.forEach(slot => slot?.cleanup?.()); }
  render();
  return { render, unmount, onClose, props, motionCalls, writes, copies, citations,
    dom(className) { return [...dom.values()].find(element => element.props.className === className); },
    button(label) { return nodes(render()).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); },
    header() { return nodes(render()).find(node => node.type === 'header'); },
    escape() { modal.onEscape(); },
    drag(distance = 80) { const header = this.header(), target = new Element(); header.props.onPointerDown({ isPrimary: true, target, clientY: 10, pointerId: 1, currentTarget: { setPointerCapture() {} } }); header.props.onPointerUp({ clientY: 10 + distance }); },
    async flush() { render(); await new Promise(setImmediate); render(); },
    get closed() { return closed; }, get retries() { return retries; }, get cited() { return cited; }, get projectReads() { return projectReads; }, get modal() { return modal; }, get mounted() { return mounted; }, get focusAtRetry() { return focusAtRetry; },
  };
}

test('MOBILE renders loading, inline failure, Retry and resolved citation in the same modal frame', () => {
  const h = fixture(), backdrop = h.dom('citation-backdrop'), dialog = h.dom('cite-sheet cite-source-sheet');
  let tree = h.render(); assert.equal(nodes(tree).find(node => node.props.role === 'dialog').props['aria-modal'], 'true'); assert.equal(h.modal.open, true); assert.equal(h.modal.preventScroll, true);
  assert.equal(nodes(tree).some(node => node.props['aria-busy'] === true), false, 'The loading announcement must not be suppressed by a busy ancestor.'); assert.equal(nodes(tree).find(node => node.props.role === 'status').props.children, 'Loading citation…');
  assert.equal(nodes(tree).some(node => node.type === 'textarea' || node.type === 'select'), false); assert.equal(h.button('Close').props.disabled, false); assert.equal(h.projectReads, 0);
  tree = h.render({ opening: { error: 'Citation could not be loaded.', onRetry: h.props.opening.onRetry } });
  assert.equal(nodes(tree).find(node => node.props.role === 'alert').props.children, 'Citation could not be loaded.');
  h.button('Retry').props.onClick(); assert.equal(h.retries, 1); assert.equal(h.focusAtRetry?.preventScroll, true, 'Focus must return to the retained dialog before Retry removes its own button.'); assert.equal(dialog.focusOptions.preventScroll, true); assert.equal(h.dom('citation-backdrop'), backdrop); assert.equal(h.dom('cite-sheet cite-source-sheet'), dialog);
  tree = h.render({ item: source, opening: { ...h.props.opening, error: '' } });
  assert.equal(h.dom('citation-backdrop'), backdrop); assert.equal(h.dom('cite-sheet cite-source-sheet'), dialog); assert.equal(nodes(tree).some(node => node.props.className === 'cite-opening-feedback'), false);
  assert.match(nodes(tree).find(node => node.type === 'textarea').props.value, /Source creator/); assert.ok(h.button('Copy MLA')); assert.equal(h.dom('cite-sheet cite-source-sheet').props['data-cite-pending'], undefined); h.unmount();
});

test('managed MOBILE Close, Escape and drag immediately release the owner with only a decorative exit root', () => {
  for (const action of ['close', 'escape', 'drag']) for (const item of [null, source]) {
    const h = fixture({ item }), backdrop = h.dom('citation-backdrop');
    if (action === 'close') h.button('Close').props.onClick(); else h[action]();
    assert.equal(h.motionCalls.length, 1); assert.equal(h.motionCalls[0][0], h.onClose); assert.equal(h.motionCalls[0][1], backdrop); assert.equal(h.closed, 1); assert.equal(h.mounted, false);
  }
});

test('direct MOBILE and WEB ready callers retain the original delayed motion Close contract', () => {
  for (const presentation of ['mobile', 'web']) for (const action of ['close', 'escape', 'drag']) {
    const h = fixture({ presentation, managed: false, item: source });
    if (action === 'close') h.button('Close').props.onClick(); else h[action]();
    assert.equal(h.motionCalls.length, 1); assert.deepEqual(h.motionCalls[0], []); assert.equal(h.closed, 0); assert.equal(h.dom('citation-backdrop').props['data-presentation'], undefined); h.unmount();
  }
});

test('the managed MOBILE portal carries app reduced motion without changing direct MOBILE or WEB callers', () => {
  for (const reduce of [false, true]) {
    const h = fixture({ reduce }); assert.equal(h.dom('citation-backdrop').props['data-cite-reduced-motion'], reduce ? '' : undefined); h.unmount();
  }
  for (const options of [{ presentation: 'mobile', managed: false }, { presentation: 'web', managed: false }, { presentation: 'web', managed: true }]) {
    const h = fixture({ ...options, item: source, reduce: true }); assert.equal(h.dom('citation-backdrop').props['data-cite-reduced-motion'], undefined); h.unmount();
  }
});

test('managed MOBILE citation writes retain busy and in-flight dismissal guards', async () => {
  const h = fixture({ item: source, reader: true }); h.button('Add reference to my project').props.onClick(); await h.flush();
  const staleClose = h.button('Close').props.onClick; h.button('Add to «My project»').props.onClick(); staleClose();
  assert.equal(h.citations.length, 1); assert.equal(h.motionCalls.length, 0, 'The in-flight ref guards dismissal before the busy render commits.'); assert.equal(h.closed, 0);
  assert.equal(h.button('Close').props.disabled, true); h.escape(); h.drag(); assert.equal(h.motionCalls.length, 0);
  h.citations[0].resolve({ id: 'new-reference' }); await h.flush(); assert.equal(h.cited, 1); assert.equal(h.button('Close').props.disabled, false);
  h.button('Close').props.onClick(); assert.equal(h.closed, 1);
});

test('a resolved managed MOBILE citation preserves exact-preview Copied feedback', async () => {
  const h = fixture(); h.render({ item: source }); const preview = nodes(h.render()).find(node => node.type === 'textarea').props.value;
  h.button('Copy MLA').props.onClick(); assert.deepEqual(h.writes, [preview]); assert.ok(h.button('Copy MLA')); assert.equal(h.button('Copied'), undefined);
  h.copies[0].resolve(); await h.flush(); const copied = h.button('Copied'); assert.ok(copied); assert.equal(copied.props['data-copy-state'], 'copied'); assert.equal(nodes(copied).some(node => node.type === 'interface-icon' && node.props.icon === 'check-icon'), true);
  nodes(h.render()).find(node => node.type === 'select').props.onChange({ target: { value: 'apa' } }); assert.ok(h.button('Copy APA')); assert.equal(h.button('Copied'), undefined); assert.equal(h.projectReads, 0); assert.equal(h.citations.length, 0); h.unmount();
});
