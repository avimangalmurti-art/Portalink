import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
function execute(source, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, ...globals, require(name) {
      if (name.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
      if (name.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
function buildConfig(command, runtime) {
  const factory = execute(read('vite.config.ts').replaceAll('import.meta.url', 'configUrl'), {
    './scripts/build-environment.mjs': { requireBuildEnvironment() {} },
    './src/features/sharing/shareModel': sourceModule('src/features/sharing/shareModel.ts'),
    './src/server/health': {}, './src/server/citation': {}, './src/server/sharedPreview': {}, './src/server/shareAddress': {}, 'node:fs/promises': {},
    vite: { defineConfig: value => value, loadEnv: () => ({ VITE_RUNTIME_MODE: runtime }) },
    'node:url': { fileURLToPath },
    'node:fs': { mkdirSync() {}, writeFileSync() {} },
    './scripts/shared-profile-preload.mjs': { sharedProfilePreloadPlugin: () => ({}) },
    './scripts/app-version.mjs': { appVersionHash: () => '0123456789abcdef' },
    './scripts/public-media-preview.mjs': { publicMediaPreviewPlugin: () => ({ name: 'portalink-public-media-preview', apply: 'serve' }) },
    '@vitejs/plugin-react': { default: () => ({}) , __esModule: true },
    '@openai/sites-vite-plugin': { sites: () => ({}) },
  }, { configUrl: new URL('../vite.config.ts', import.meta.url).href, URL, process: { cwd: () => root } }).default;
  return factory({ command, mode: 'production' });
}

test('production builds choose the durable registry; development and explicit prototype retain runtime selection', () => {
  for (const runtime of [undefined, '', 'production', ' PRODUCTION ']) {
    const aliases = buildConfig('build', runtime).resolve.alias;
    assert.equal(aliases.length, 1);
    assert.ok(aliases[0].find.test('./runtimeServices'));
    assert.equal(aliases[0].replacement, resolve(root, 'src/services/productionServices.ts'));
  }
  for (const runtime of ['prototype', ' PROTOTYPE ']) assert.equal(buildConfig('build', runtime).resolve.alias.length, 0);
  for (const runtime of [undefined, 'production', 'prototype']) assert.equal(buildConfig('serve', runtime).resolve.alias.length, 0);
});

test('the production startup graph excludes mock identities, seed imagery and unopened large dialogs', () => {
  const aliases = buildConfig('build').resolve.alias;
  const visited = new Set();
  const externalImports = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    if (!/\.[m]?[jt]sx?$/.test(file)) return;
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || node.isTypeOnly || node.importClause?.isTypeOnly) continue;
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && !node.importClause.name && bindings.elements.every(item => item.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) externalImports.add(specifier);
      if (!specifier.startsWith('.') || /\.css$/.test(specifier)) continue;
      const alias = aliases.find(item => item.find.test(specifier));
      const base = alias?.replacement ?? resolve(dirname(file), specifier);
      const target = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx'].map(extension => base + extension).find(candidate => existsSync(candidate) && /\.[m]?[jt]sx?$|\.json$/.test(candidate));
      assert.ok(target, `Cannot resolve ${specifier} from ${relative(root, file)}`);
      visit(target);
    }
  }
  visit(resolve(root, 'src/index.tsx'));
  const paths = [...visited].map(file => relative(root, file).replaceAll('\\', '/'));
  assert.ok(paths.includes('src/services/productionServices.ts'));
  assert.deepEqual([...externalImports].filter(name => name.startsWith('@dnd-kit/')), [], 'Browsing loads no drag-and-drop modules.');
  assert.ok(paths.includes('src/services/supabase/client.ts'), 'Configuration and ownership checks remain in startup.');
  assert.ok(paths.includes('src/components/ui/PortalinkSplashLoader.tsx'), 'The existing splash remains eager.');
  assert.deepEqual(paths.filter(path => /\/services\/(mocks|prototype)\/|\/data\/(profiles|sourceImages)\.ts$/.test(path)), []);
  for (const path of ['features/auth/AuthDialog.tsx', 'features/publishing/PublishProjectDialog.tsx',
    'features/profile/ProfileOnboardingDialog.tsx', 'features/profile/ProfileEditorDialog.tsx',
    'features/profile/PortalsPage.tsx', 'components/AppDetailPage.tsx', 'components/profile/IconPickerPage.tsx']) {
    assert.ok(!paths.includes(`src/${path}`), `${path} must wait until requested`);
  }
});

test('runtime registry retains durable configured APIs and truthful prototype capability selection', () => {
  const keys = ['auth', 'profiles', 'projects', 'media', 'discovery', 'social', 'engagement', 'creatorSaves', 'comments', 'notifications', 'messaging', 'live', 'geography'];
  const connected = Object.fromEntries(keys.map(key => [key, { source: `connected-${key}` }]));
  const mockNames = { profiles: 'Profile', projects: 'Project', media: 'Media', discovery: 'Discovery', social: 'Social', engagement: 'Engagement', comments: 'Comment', notifications: 'Notification', messaging: 'Messaging', live: 'Live' };
  const mocks = Object.fromEntries(Object.entries(mockNames).map(([key, name]) => [`mock${name}Service`, { source: `mock-${key}` }]));
  const prototypeAuthService = {}, unavailableCreatorSaveService = {};
  for (const configured of [false, true]) for (const production of [false, true]) {
    const { services } = execute(read('src/services/runtimeServices.ts'), {
      './productionServices': { services: connected }, './mocks': mocks,
      './prototype/authService': { prototypeAuthService },
      './supabase/client': { isSupabaseConfigured: configured, isProductionRuntime: production },
      './supabase/creatorSaveService': { unavailableCreatorSaveService },
    });
    assert.equal(services.auth, configured ? connected.auth : prototypeAuthService);
    for (const [key, name] of Object.entries(mockNames)) {
      const durable = key === 'live' ? production : configured;
      assert.equal(services[key], durable ? connected[key] : mocks[`mock${name}Service`]);
    }
    assert.equal(services.creatorSaves, configured ? connected.creatorSaves : unavailableCreatorSaveService);
    assert.equal(services.geography, connected.geography);
  }
});

test('a deferred dialog stays unloaded until first use and remains mounted through close and reopen', () => {
  let cursor = 0, effects = [];
  const slots = [];
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i][index])) { slots[i] = deps; effects.push(effect); } },
  };
  const { DeferredDialog } = execute(read('src/components/ui/DeferredDialog.tsx'), { react,
    '../../hooks/useModalFocus': {}, '../../hooks/useDialogViewport': {}, './ModalPortal': {},
  });
  const render = (active, children) => { cursor = 0; effects = []; const result = DeferredDialog({ active, children }); effects.forEach(effect => effect()); return result; };
  const child = React.createElement('dialog-content', { draft: 'pending draft' });
  assert.equal(render(false, child), null);
  for (const active of [true, false, true, false]) {
    const rendered = render(active, child);
    assert.equal(rendered.type.name, 'DeferredSurface');
    assert.equal(rendered.props.children, child);
    const boundary = rendered.type(rendered.props);
    assert.equal(boundary.type.name, 'DeferredSurfaceBoundary');
    const suspense = boundary.props.children;
    assert.equal(suspense.type, React.Suspense);
    assert.equal(suspense.props.children, child);
    assert.equal(Boolean(suspense.props.fallback), active, 'Closed mounted dialogs never expose loading UI.');
  }
});


test('a rejected deferred surface stays contained, is dismissible, and reloads only by explicit request', () => {
  let closes = 0, reloads = 0;
  const focus = [];
  const exports = execute(read('src/components/ui/DeferredDialog.tsx'), {
    react: { ...React, useRef: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus: (...args) => focus.push(args) },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    './ModalPortal': { ModalPortal: 'ModalPortal' },
  }, { window: { location: { reload: () => reloads++ } } });
  const child = React.createElement('form', { draft: 'saved registration remains untouched' });
  const onClose = () => closes++;
  const boundary = new exports.DeferredSurfaceBoundary({ active: true, children: child, onClose, resetKey: 'first-route' });
  assert.equal(boundary.render(), child);
  boundary.state = { ...boundary.state, ...exports.DeferredSurfaceBoundary.getDerivedStateFromError(new Error('Chunk failed')) };
  const error = boundary.render();
  assert.equal(error.props.failed, true);
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  const rendered = nodes(error.type(error.props));
  assert.equal(rendered[0].type, 'ModalPortal');
  assert.ok(rendered.some(node => node.props.role === 'alert'));
  assert.ok(rendered.some(node => node.props.role === 'dialog' && node.props['aria-modal'] === 'true'));
  assert.equal(focus[0][0], true);
  assert.equal(focus[0][2], onClose, 'Escape uses the existing surface close path.');
  assert.equal(reloads, 0);
  rendered.find(node => node.type === 'button' && node.props.children === 'Close').props.onClick();
  assert.equal(closes, 1);
  boundary.props = { ...boundary.props, active: false };
  assert.equal(boundary.render(), null, 'A late failure while closed never opens a modal or escapes to the app.');
  boundary.props = { ...boundary.props, active: true };
  assert.equal(boundary.render().props.failed, true, 'Reopening does not claim a cached rejected lazy import was retried.');
  assert.equal(reloads, 0);
  rendered.find(node => node.type === 'button' && node.props.children === 'Reload').props.onClick();
  assert.equal(reloads, 1);
  assert.equal(exports.DeferredSurfaceBoundary.getDerivedStateFromProps(boundary.props, boundary.state), null);
  boundary.props = { ...boundary.props, resetKey: 'another-route' };
  boundary.state = { ...boundary.state, ...exports.DeferredSurfaceBoundary.getDerivedStateFromProps(boundary.props, boundary.state) };
  assert.equal(boundary.render(), child, 'Navigating to another screen clears only the local error boundary.');
});

test('opening feedback is cancellable without reloading or mounting feature children', () => {
  let cancelled = 0;
  const { DeferredSurface } = execute(read('src/components/ui/DeferredDialog.tsx'), {
    react: { ...React, useRef: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    './ModalPortal': { ModalPortal: 'ModalPortal' },
  });
  const surface = DeferredSurface({ active: true, children: 'unresolved form', onClose: () => cancelled++ });
  const fallback = surface.props.children.props.fallback;
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  const rendered = nodes(fallback.type(fallback.props));
  assert.ok(rendered.some(node => node.props.role === 'status' && node.props.children === 'Opening\u2026'));
  const buttons = rendered.filter(node => node.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.children, 'Cancel');
  buttons[0].props.onClick();
  assert.equal(cancelled, 1);
});
