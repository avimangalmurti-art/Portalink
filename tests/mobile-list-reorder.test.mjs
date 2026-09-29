import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { arrayMove } from '@dnd-kit/sortable';
import { TouchSensor as InstalledTouchSensor } from '@dnd-kit/core';

function compile(path, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require, ...globals });
  return exports;
}
const DndContext = () => null, SortableContext = () => null;
class TouchSensor {} class MouseSensor {} class KeyboardSensor {}
const sortableKeyboardCoordinates = () => {};
const activateTouch = () => {}, activateMouse = () => {}, activateKeyboard = () => {};
function harness() {
  let dragging = false, reducedMotion = false;
  const { MobileReorderList } = compile('../src/presentation/mobile/MobileReorderList.tsx', name => {
    if (name === 'react') return React;
    if (name === '@dnd-kit/core') return { DndContext, TouchSensor, MouseSensor, KeyboardSensor,
      KeyboardCode: { Space: 'Space', Esc: 'Escape', Enter: 'Enter' },
      useSensor: (sensor, options) => ({ sensor, options }), useSensors: (...sensors) => sensors,
      closestCenter: args => args.droppableContainers.map(container => ({ id: container.id })) };
    if (name === '@dnd-kit/sortable') return { SortableContext, arrayMove, sortableKeyboardCoordinates,
      verticalListSortingStrategy() {}, useSortable: ({ disabled }) => ({
        attributes: { tabIndex: 0, role: 'button' },
        listeners: disabled ? {} : { onTouchStart: activateTouch, onMouseDown: activateMouse, onKeyDown: activateKeyboard },
        setNodeRef() {}, setActivatorNodeRef() {}, transform: null, transition: 'transform 200ms', isDragging: dragging,
      }) };
    if (name === '@dnd-kit/utilities') return { CSS: { Transform: { toString: () => undefined } } };
    if (name === 'framer-motion') return { useReducedMotion: () => reducedMotion };
    throw new Error(`Unexpected import ${name}`);
  });
  const saves = [];
  const props = { items: [{ id: 'a' }, { id: 'b' }, { id: 'hidden' }], label: 'Portals', className: 'list',
    onReorder: items => saves.push(items.map(item => item.id)),
    groupForItem: item => item.id === 'hidden' ? 'hidden' : 'visible',
    renderItem: (item, activator) => React.createElement('button', { ...activator }, item.id) };
  return { props, saves, render: () => MobileReorderList(props), setDragging: value => { dragging = value; }, setReducedMotion: value => { reducedMotion = value; } };
}
const drop = (tree, from, to) => tree.props.onDragEnd({ active: { id: from }, over: to === null ? null : { id: to } });
const firstRow = tree => { const row = tree.props.children.props.children.props.children[0]; return row.type(row.props); };

test('hold sensors wait 450ms and tolerate 8px, with a keyboard alternative', () => {
  const tree = harness().render();
  assert.deepEqual(tree.props.sensors.map(item => item.sensor), [TouchSensor, MouseSensor, KeyboardSensor]);
  for (const sensor of tree.props.sensors.slice(0, 2)) {
    assert.equal(sensor.options.activationConstraint.delay, 450);
    assert.equal(sensor.options.activationConstraint.tolerance, 8);
  }
  assert.equal(tree.props.sensors[2].options.coordinateGetter, sortableKeyboardCoordinates);
  assert.deepEqual(Array.from(tree.props.sensors[2].options.keyboardCodes.start), ['Space']);
});

test('changed release saves once; unchanged, cancelled, stale, disabled and cross-group drops save nothing', () => {
  const h = harness();
  const tree = h.render();
  assert.equal(tree.props.onDragMove, undefined);
  assert.equal(tree.props.onDragOver, undefined);
  for (const [from, to] of [['a', 'a'], ['a', null], ['a', 'hidden'], ['missing', 'b']]) drop(tree, from, to);
  assert.deepEqual(h.saves, []);
  drop(tree, 'a', 'b');
  assert.deepEqual(h.saves, [['b', 'a', 'hidden']]);
  assert.deepEqual(h.props.items.map(item => item.id), ['a', 'b', 'hidden']);
  h.props.disabled = true;
  drop(h.render(), 'a', 'b');
  assert.equal(h.saves.length, 1);
});

test('collision candidates stay within visibility groups', () => {
  const tree = harness().render();
  const result = tree.props.collisionDetection({ active: { id: 'a' }, droppableContainers: [{ id: 'a' }, { id: 'b' }, { id: 'hidden' }] });
  assert.deepEqual(Array.from(result, item => item.id), ['a', 'b']);
});

test('only the destination gets hold listeners; disabled rows remain ordinary buttons', () => {
  const h = harness();
  let row = firstRow(h.render());
  assert.equal(row.props.onTouchStart, undefined);
  assert.equal(row.props.children.props.onTouchStart, activateTouch);
  let prevented = false;
  row.props.children.props.onContextMenu({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  h.setDragging(true); h.setReducedMotion(true);
  row = firstRow(h.render());
  assert.equal(row.props['data-dragging'], true);
  assert.equal(row.props.style.transition, 'none');
  h.props.disabled = true;
  row = firstRow(h.render());
  assert.equal(row.props.children.props.onTouchStart, undefined);
  assert.equal(row.props.children.props.onContextMenu, undefined);
});

const ReorderGroup = () => null;
const MobileReorderList = () => null;
function projectHarness() {
  const slots = []; let cursor = 0;
  const react = { ...React,
    useState(initial) { const i=cursor++; if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}]; },
    useRef(initial) { const i=cursor++; return slots[i]??={current:initial}; },
    useCallback: fn => fn, useLayoutEffect() {},
  };
  let presentation = 'mobile';
  const { ProjectIndexList } = compile('../src/components/profile/ProjectIndexList.tsx', name => {
    if (name === 'react') return react;
    if (name === 'react-dom') return { createPortal: node => node };
    if (name === 'framer-motion') return { Reorder: { Group: ReorderGroup }, useDragControls: () => ({}), AnimatePresence: () => null, motion: { div: 'div' } };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileReorderList')) return { MobileReorderList };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: () => null };
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({}) };
    return {};
  }, { document: { querySelector: () => ({}), body: {} } });
  const saves = [];
  const props = { projects: ['a', 'b', 'p1', 'p2', 'h1', 'h2'].map(id => ({ id, title: id })),
    typefaceStacks: {}, typefaceIds: {}, hiddenIds: ['h1', 'h2'], pinnedIds: ['p1', 'p2'], isOwner: true,
    onReorder: items => saves.push(Array.from(items, item => item.id)) };
  return { props, saves, render: () => { cursor=0; return ProjectIndexList(props); }, renderRow: row => { cursor=100; return row.type(row.props); }, setPresentation: value => { presentation = value; } };
}
function all(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(all)];
}
test('mobile project groups emit complete membership without changing pinned or hidden status', () => {
  const h = projectHarness();
  const groups = all(h.render()).filter(node => node.type === MobileReorderList);
  assert.deepEqual(groups.map(node => node.props.label), ['Pinned projects', 'Projects', 'Hidden projects']);
  groups[1].props.onReorder([...groups[1].props.items].reverse());
  assert.deepEqual(h.saves, [['p1', 'p2', 'b', 'a', 'h1', 'h2']]);
  assert.deepEqual(h.props.pinnedIds, ['p1', 'p2']);
  assert.deepEqual(h.props.hiddenIds, ['h1', 'h2']);
  h.props.mobileReorderDisabled = true;
  assert.ok(all(h.render()).filter(node => node.type === MobileReorderList).every(node => node.props.disabled));
});

test('visitor index has no reordering and WEB keeps its original drag group', () => {
  const h = projectHarness();
  h.props.isOwner = false;
  assert.equal(all(h.render()).filter(node => node.type === MobileReorderList || node.type === ReorderGroup).length, 0);
  h.props.isOwner = true; h.setPresentation('web');
  assert.equal(all(h.render()).filter(node => node.type === MobileReorderList).length, 0);
  assert.equal(all(h.render()).filter(node => node.type === ReorderGroup).length, 1);
});

test('project writes are gated during unavailable arrangements, partial search, and MOBILE display sorting', () => {
  const source = readFileSync(new URL('../src/components/profile/ProfileCategoryPage.tsx', import.meta.url), 'utf8');
  const expression = source.match(/mobileReorderDisabled=\{([^}]+)\}/)?.[1];
  assert.ok(expression);
  const evaluate = (overrides = {}) => vm.runInNewContext(expression, {
    arrangement: { isLoading: false, loadError: null, isSaving: false }, indexQuery: '', isMobile: true, mobileSort: 'saved', ...overrides,
  });
  assert.equal(evaluate(), false);
  for (const key of ['isLoading', 'loadError', 'isSaving']) assert.equal(evaluate({ arrangement: { [key]: key === 'loadError' ? 'Unavailable' : true } }), true);
  assert.equal(evaluate({ isMobile: false, indexQuery: 'filtered' }), true);
  const indexQuery = source.match(/const indexQuery = ([^;]+);/)?.[1];
  assert.ok(indexQuery);
  assert.equal(vm.runInNewContext(indexQuery, { isMobile: true, query: 'filtered' }), '', 'MOBILE has no index search filter');
  assert.equal(evaluate({ mobileSort: 'recent' }), true);
  assert.equal(evaluate({ mobileSort: 'title' }), true);
  assert.equal(evaluate({ isMobile: false, mobileSort: 'recent' }), false, 'MOBILE sorting never blocks WEB arrangement');
});

// Exercise the installed sensor's gesture lifecycle as well as our component
// wiring. This event shim is a unit test, not physical Safari verification.
test('touch tap, scroll and pinch cancel pickup; ordinary holds still drag and clean up', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class Surface {
    listeners = new Map();
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(fn => fn !== listener)); }
    fire(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  class Document extends Surface { getSelection() { return null; } }
  class Element extends Surface { nodeType = 1; }
  class TouchEvent {
    constructor(target, y = 0) { this.target = target; this.touches = [{ clientX: 0, clientY: y }]; }
    cancelable = true;
    prevented = false;
    preventDefault() { this.prevented = true; }
  }
  const win = Object.assign(new Surface(), { Document, HTMLElement: Element, SVGElement: Element, TouchEvent, EventTarget: Surface });
  const doc = Object.assign(new Document(), { defaultView: win });
  const target = Object.assign(new Element(), { ownerDocument: doc });
  let starts = 0, cancels = 0, aborts = 0, ends = 0;
  const create = (Sensor = InstalledTouchSensor) => new Sensor({ active: 'a', event: new TouchEvent(target),
    options: harness().render().props.sensors[0].options,
    onPending() {}, onStart() { starts++; }, onCancel() { cancels++; }, onAbort() { aborts++; }, onEnd() { ends++; }, onMove() {},
  });
  const tap = create();
  t.mock.timers.tick(100); tap.handleEnd(); t.mock.timers.tick(500);
  assert.equal(starts, 0); assert.equal(aborts, 1);
  const scrolling = create();
  const scrollEvent = new TouchEvent(target, 20);
  scrolling.handleMove(scrollEvent); t.mock.timers.tick(500);
  assert.equal(starts, 0); assert.equal(cancels, 1); assert.equal(scrollEvent.prevented, false);
  const holding = create();
  t.mock.timers.tick(449); assert.equal(starts, 0);
  t.mock.timers.tick(1); assert.equal(starts, 1);
  const dragEvent = new TouchEvent(target, 70);
  holding.handleMove(dragEvent); assert.equal(dragEvent.prevented, true);
  holding.handleEnd();
  let stopped = false;
  doc.fire('click', { stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  t.mock.timers.tick(50); stopped = false;
  doc.fire('click', { stopPropagation() { stopped = true; } });
  assert.equal(stopped, false);

  const { SingleTouchSensor } = compile('../src/presentation/mobile/SingleTouchSensor.ts', name => {
    assert.equal(name, '@dnd-kit/core'); return { TouchSensor: InstalledTouchSensor };
  });
  starts = cancels = aborts = ends = 0;
  create(SingleTouchSensor);
  const pinch = new TouchEvent(target);
  pinch.touches.push({ clientX: 160, clientY: 0 });
  // The first finger has not moved: the ordinary sensor would still activate
  // its 450ms hold while the second finger changes the content's zoom.
  doc.fire('touchstart', pinch);
  t.mock.timers.tick(500);
  assert.equal(starts, 0);
  assert.equal(cancels, 1);
  assert.equal(aborts, 1);
  assert.equal(ends, 0, 'A pinch must not commit a reorder');
  assert.equal(pinch.prevented, false, 'The content still receives the pinch');
  assert.equal(doc.listeners.get('touchstart').length, 0);
  assert.equal(doc.listeners.get('touchcancel').length, 0);

  const singleFingerHold = create(SingleTouchSensor);
  t.mock.timers.tick(450);
  assert.equal(starts, 1, 'Ordinary holds still activate');
  singleFingerHold.handleEnd();
  assert.equal(ends, 1);
  assert.equal(doc.listeners.get('touchstart').length, 0);

  create(SingleTouchSensor);
  t.mock.timers.tick(450);
  doc.fire('touchstart', pinch);
  assert.equal(cancels, 2, 'A second touch also cancels an active drag');
  assert.equal(ends, 1);
  assert.equal(doc.listeners.get('touchstart').length, 0);

  create(SingleTouchSensor);
  doc.fire('touchcancel', new TouchEvent(target));
  t.mock.timers.tick(500);
  assert.equal(starts, 2);
  assert.equal(cancels, 3);
  assert.equal(ends, 1);
  assert.equal(doc.listeners.get('touchcancel').length, 0);
});

test('floating mobile rows only navigate, with owner reordering kept in the menu', () => {
  const h = projectHarness(); h.props.mobileReorderFromMenu = true;
  const selections = [];
  h.props.onSelect = id => selections.push(id);
  let group = all(h.render()).find(node => node.type === MobileReorderList);
  const actions = { moveUp() {}, moveDown() {} };
  const row = group.props.renderItem(group.props.items[0], { onTouchStart: activateTouch, onMouseDown: activateMouse }, actions);
  assert.equal(row.props.reorderActivator, undefined);
  assert.equal(row.props.reorderActions, actions);
  let rendered = h.renderRow(row);
  const title = all(rendered).find(node => node.type === 'button' && node.props.title === row.props.project.title);
  for (const key of ['onTouchStart', 'onMouseDown', 'onPointerDown', 'onContextMenu', 'aria-haspopup']) {
    assert.equal(title.props[key], undefined);
  }
  title.props.onClick();
  assert.deepEqual(selections, [row.props.project.id]);
  all(rendered).find(node => node.props['data-row-menu'] !== undefined).props.onClick();
  rendered = h.renderRow(row);
  const moves = all(rendered).filter(node => node.props.role === 'menuitem').map(node => node.props.children).filter(label => typeof label === 'string');
  assert.deepEqual(moves, ['Move up', 'Move down']);
  h.props.isOwner = false;
  const visitorRows = all(h.render()).filter(node => node.props.project);
  assert.ok(visitorRows.length > 0);
  for (const visitorRow of visitorRows) {
    const button = all(h.renderRow(visitorRow)).find(node => node.type === 'button');
    assert.equal(button.props.onPointerDown, undefined);
    assert.equal(button.props['aria-haspopup'], undefined);
    button.props.onClick();
    assert.equal(selections.at(-1), visitorRow.props.project.id);
  }
  h.setPresentation('web');
  assert.ok(all(h.render()).filter(node => node.props.project).every(node => !node.props.reorderActivator));
  h.setPresentation('mobile'); h.props.isOwner = true; h.props.mobileReorderFromMenu = false;
  group = all(h.render()).find(node => node.type === MobileReorderList);
  const ordinaryRow = group.props.renderItem(group.props.items[0], { onTouchStart: activateTouch }, actions);
  assert.equal(ordinaryRow.props.reorderActivator.onTouchStart, activateTouch);
  const source = readFileSync(new URL('../src/components/profile/ProfileCategoryPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /<ProjectIndexList[^>]*mobileReorderFromMenu=\{isMobile\}/);
});


test('WEB stages drag frames locally and saves only the final drop with complete membership', () => {
  const h=projectHarness();h.setPresentation('web');
  let group=all(h.render()).find(node=>node.type===ReorderGroup);
  group.props.children[0].props.onReorderStart();
  group.props.onReorder([...group.props.values].reverse());
  group=all(h.render()).find(node=>node.type===ReorderGroup);
  assert.deepEqual(Array.from(group.props.values,p=>p.id),['b','a']);assert.deepEqual(h.saves,[]);
  group.props.children[0].props.onReorderEnd();
  assert.deepEqual(h.saves,[['p1','p2','b','a','h1','h2']]);
});

test('visible move actions respect the same group boundaries and disabled state as dragging',()=>{
  const h=harness();let actions;
  h.props.renderItem=(item,activator,moves)=>{if(item.id==='a')actions=moves;return React.createElement('button',activator,item.id);};
  firstRow(h.render());assert.equal(actions.moveUp,undefined);assert.equal(typeof actions.moveDown,'function');
  actions.moveDown();assert.deepEqual(h.saves,[['b','a','hidden']]);
  h.props.disabled=true;firstRow(h.render());assert.equal(actions.moveDown,undefined);
});
