import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function compile(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, ...globals });
  return exports;
}
const defaultsModule = compile(read('../src/utils/panelLayoutDefaults.ts'));
const { panelLayoutDefaults: defaults, PANEL_LAYOUT_RESET_EVENT } = defaultsModule;
const { allocateProjectPanels: allocate } = compile(read('../src/utils/projectPanelLayout.ts'));
const key = (id) => `portalink.layout.panel.${id}`;
const main = { id: 'main-navigation', defaultWidth: defaults.navigation, minWidth: 184, maxWidth: 360, viewportReserve: 340 };
const index = { id: 'project-index', defaultWidth: defaults.projectIndex, minWidth: 220, maxWidth: 420, viewportReserve: 360 };
const response = { id: 'project-response', defaultWidth: defaults.engagement, minWidth: 304, maxWidth: 440, viewportReserve: 420 };

function harness(entries = {}) {
  const storage = new Map(Object.entries(entries));
  const window = new EventTarget();
  window.innerWidth = 1400;
  window.localStorage = {
    get length() { return storage.size; }, key: (i) => [...storage.keys()][i] ?? null,
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
  };
  let active;
  const react = {
    useState(initial) {
      const instance = active, i = instance.cursor++;
      if (!(i in instance.slots)) instance.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [instance.slots[i], (value) => { instance.slots[i] = typeof value === 'function' ? value(instance.slots[i]) : value; }];
    },
    useEffect(effect, deps) {
      const instance = active, i = instance.cursor++;
      if (!instance.slots[i] || deps.some((dep, n) => dep !== instance.slots[i].deps[n])) {
        instance.slots[i]?.cleanup?.();
        instance.slots[i] = { deps, cleanup: effect() };
      }
    },
    useCallback: (callback) => callback, useMemo: (callback) => callback(),
  };
  const api = compile(read('../src/components/ui/ResizablePanelHandle.tsx'), {
    window, Event, require: (name) => name === 'react' ? react : defaultsModule,
  });
  return { window, storage, reset: api.resetResizablePanelLayout,
    mount(options) {
      const instance = { cursor: 0, slots: [] };
      return () => { active = instance; instance.cursor = 0; return api.useResizablePanelWidth(options); };
    },
  };
}

test('fresh navigation uses matching compact widths and engagement keeps the minimum readable expanded size', () => {
  const h = harness();
  assert.equal(h.mount(main)().width, 280);
  assert.equal(h.mount(index)().width, 280);
  assert.equal(h.mount(response)().width, 304);
  assert.equal(defaults.sharedDetails, 240);
  const closed = allocate(1120, true, false, defaults.projectIndex, defaults.engagement, 304, null, null);
  assert.deepEqual([closed.indexWidth, closed.responseWidth, closed.workWidth], [280, 52, 788]);
  const open = allocate(1120, true, true, defaults.projectIndex, defaults.engagement, 304, null, null);
  assert.deepEqual([open.indexWidth, open.responseWidth, open.workWidth], [280, 304, 536]);
});

test('existing custom sizes, including deliberate maximum sizes, survive until the user resets', () => {
  const h = harness({ [key(main.id)]: '360', [key(index.id)]: '315', 'portalink.layout.panel-revision': 'maximum-defaults-v1' });
  assert.equal(h.mount(main)().width, 360);
  assert.equal(h.mount(index)().width, 315);
  assert.equal(h.storage.get(key(main.id)), '360');
});

test('global reset reaches mounted panels and later mounts without changing appearance or unrelated storage', () => {
  const h = harness({ [key(index.id)]: '420', 'portalinknetworks.accentColor': '#007aff', unrelated: 'keep' });
  const navigation = h.mount(main), engagement = h.mount(response);
  navigation().commitWidth(340);
  engagement().commitWidth(400);
  let resets = 0;
  h.window.addEventListener(PANEL_LAYOUT_RESET_EVENT, () => resets++);
  h.reset();
  assert.equal(resets, 1);
  assert.equal(navigation().preferredWidth, 280);
  assert.equal(engagement().preferredWidth, 304);
  assert.equal(h.mount(index)().width, 280);
  assert.ok(![...h.storage.keys()].some((name) => name.startsWith('portalink.layout.panel.')));
  assert.equal(h.storage.get('portalinknetworks.accentColor'), '#007aff');
  assert.equal(h.storage.get('unrelated'), 'keep');
});

test('single-panel reset restores its own default while resizing remains available afterward', () => {
  const h = harness();
  const navigation = h.mount(main), engagement = h.mount(response);
  navigation().commitWidth(360);
  engagement().commitWidth(440);
  navigation().resetWidth();
  assert.equal(navigation().width, 280);
  assert.equal(engagement().width, 440);
  navigation().commitWidth(360);
  assert.equal(h.mount(main)().width, 360);
});

test('a narrow viewport compresses the display without overwriting saved widths', () => {
  const h = harness({ [key(main.id)]: '330' });
  const navigation = h.mount(main);
  navigation();
  h.window.innerWidth = 580;
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(navigation().width, 240);
  assert.equal(navigation().preferredWidth, 330);
  assert.equal(h.storage.get(key(main.id)), '330');
  h.window.innerWidth = 1400;
  h.window.dispatchEvent(new Event('resize'));
  assert.equal(navigation().width, 330);
  for (const width of [327, 480, 664, 844]) {
    const layout = allocate(width, true, false, defaults.projectIndex, defaults.engagement, 304, null, null);
    assert.equal(layout.indexWidth + layout.responseWidth + layout.workWidth, width);
    assert.ok(layout.workWidth >= Math.min(320, width - 104));
  }
});

// Execute the real reset effects without mounting unrelated services in App.
function installResetEffect(path, window, setters) {
  const source = read(path);
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0]?.getText(file).includes('PANEL_LAYOUT_RESET_EVENT')) effect = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(effect, `${path} must respond to global layout reset`);
  return compile(`export const install = ${effect};`, { window, PANEL_LAYOUT_RESET_EVENT, ...setters }).install();
}

test('reset from Appearance restores project visibility even when the project page is unmounted', () => {
  const h = harness();
  const values = {};
  const cleanup = installResetEffect('../src/App.tsx', h.window, Object.fromEntries([
    'setIsSidebarCollapsed', 'setIsProjectIndexCollapsed', 'setIsProjectEngagementOpen',
    'setIsSharedProjectIndexCollapsed', 'setIsSharedProjectDescriptionOpen',
  ].map((name) => [name, (value) => { values[name] = value; }])));
  h.reset();
  assert.deepEqual(values, {
    setIsSidebarCollapsed: false, setIsProjectIndexCollapsed: false, setIsProjectEngagementOpen: false,
    setIsSharedProjectIndexCollapsed: false, setIsSharedProjectDescriptionOpen: true,
  });
  cleanup();
  values.setIsProjectEngagementOpen = true;
  h.reset();
  assert.equal(values.setIsProjectEngagementOpen, true, 'unmounted listeners are removed');
});

test('reset clears temporary project panel overrides so they cannot reopen engagement', () => {
  const h = harness();
  let compactPanel = 'response', lastOpened = 'response';
  const cleanup = installResetEffect('../src/components/profile/ProfileCategoryPage.tsx', h.window, {
    setCompactPanel: (value) => { compactPanel = value; }, setLastOpened: (value) => { lastOpened = value; },
  });
  h.reset();
  assert.equal(compactPanel, null);
  assert.equal(lastOpened, null);
  cleanup();
});
